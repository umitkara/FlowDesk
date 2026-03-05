use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::text::resolve_entity_refs;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::State;

/// Input parameters for a full-text search query.
#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    /// Workspace to search within.
    pub workspace_id: String,
    /// Search terms.
    pub query: String,
    /// Maximum number of results.
    pub limit: Option<i64>,
    /// Number of results to skip.
    pub offset: Option<i64>,
    /// Filter by entity types (e.g. ["note", "task"]). If omitted, searches all.
    pub entity_types: Option<Vec<String>>,
}

/// A single full-text search result with highlighted snippet.
#[derive(Debug, Serialize)]
pub struct SearchResult {
    /// Entity type: "note", "task", or "plan".
    pub entity_type: String,
    /// Entity identifier.
    pub id: String,
    /// Entity title.
    pub title: Option<String>,
    /// Snippet with highlighted matches.
    pub snippet: String,
    /// Relevance rank score (lower is better).
    pub rank: f64,
    /// Entity type (note-specific: note_type).
    pub note_type: Option<String>,
    /// Folder path (notes only).
    pub folder: Option<String>,
    /// Last modification timestamp.
    pub updated_at: String,
    /// Type-specific metadata (status, priority for tasks).
    pub metadata: serde_json::Value,
}

/// Sanitizes a search query for FTS5 by escaping special characters.
fn sanitize_fts_query(query: &str) -> String {
    let cleaned: String = query
        .chars()
        .filter(|c| !matches!(c, '"' | '*' | '(' | ')' | '{' | '}' | ':' | '^'))
        .collect();
    let trimmed = cleaned.trim().to_string();
    if trimmed.is_empty() {
        return "\"\"".to_string();
    }
    // Wrap each word in quotes with * suffix for prefix matching
    trimmed
        .split_whitespace()
        .map(|word| format!("\"{}\"*", word))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Highlights all occurrences of `query` in `text` with `<mark>` tags (case-insensitive).
/// Returns a truncated snippet around the first match.
fn highlight_snippet(text: &str, query: &str) -> String {
    let lower_text = text.to_lowercase();
    let lower_query = query.to_lowercase();

    if let Some(pos) = lower_text.find(&lower_query) {
        // Extract a window around the match
        let start = pos.saturating_sub(40);
        let end = (pos + query.len() + 40).min(text.len());

        // Align to char boundaries
        let start = text.floor_char_boundary(start);
        let end = text.ceil_char_boundary(end);

        let window = &text[start..end];
        let prefix = if start > 0 { "..." } else { "" };
        let suffix = if end < text.len() { "..." } else { "" };

        // Highlight all occurrences within the window
        let lower_window = window.to_lowercase();
        let mut result = String::new();
        let mut cursor = 0;
        while let Some(idx) = lower_window[cursor..].find(&lower_query) {
            let abs = cursor + idx;
            result.push_str(&window[cursor..abs]);
            result.push_str("<mark>");
            result.push_str(&window[abs..abs + query.len()]);
            result.push_str("</mark>");
            cursor = abs + query.len();
        }
        result.push_str(&window[cursor..]);

        format!("{prefix}{result}{suffix}")
    } else {
        // No match in this text, return truncated start
        let end = text.len().min(80);
        let end = text.ceil_char_boundary(end);
        let suffix = if end < text.len() { "..." } else { "" };
        format!("{}{suffix}", &text[..end])
    }
}

/// Performs a full-text search across notes, tasks, and plans.
///
/// Uses FTS5 for prefix matching (ranked), then falls back to LIKE for
/// substring matches not caught by FTS5. Deduplicates results.
#[tauri::command]
pub fn search_entities(
    state: State<'_, AppState>,
    query: SearchQuery,
) -> Result<Vec<SearchResult>, AppError> {
    let sanitized = sanitize_fts_query(&query.query);
    let like_pattern = format!("%{}%", query.query.replace('%', "\\%").replace('_', "\\_"));
    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);
    let entity_types = query.entity_types.as_deref();

    let do_notes = entity_types.is_none()
        || entity_types.is_some_and(|types| types.iter().any(|t| t == "note"));
    let do_tasks = entity_types.is_none()
        || entity_types.is_some_and(|types| types.iter().any(|t| t == "task"));
    let do_plans = entity_types.is_none()
        || entity_types.is_some_and(|types| types.iter().any(|t| t == "plan"));

    let raw_query = query.query.clone();

    state
        .db
        .with_conn(|conn| {
            let mut results: Vec<SearchResult> = Vec::new();
            let mut seen_ids: HashSet<String> = HashSet::new();

            // === Phase 1: FTS5 prefix search (ranked) ===

            if do_notes {
                let mut stmt = conn.prepare(
                    "SELECT n.id, n.title,
                            COALESCE(snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32),
                                     snippet(notes_fts, 0, '<mark>', '</mark>', '...', 32),
                                     '') as snippet,
                            rank, n.type, n.folder, n.updated_at
                     FROM notes_fts
                     JOIN notes n ON notes_fts.rowid = n.rowid
                     WHERE notes_fts MATCH ?1 AND n.workspace_id = ?2 AND n.deleted_at IS NULL
                     ORDER BY rank
                     LIMIT ?3 OFFSET ?4",
                )?;

                let note_results = stmt
                    .query_map(
                        rusqlite::params![sanitized, query.workspace_id, limit, offset],
                        |row| {
                            Ok(SearchResult {
                                entity_type: "note".to_string(),
                                id: row.get(0)?,
                                title: row.get(1)?,
                                snippet: row.get(2)?,
                                rank: row.get(3)?,
                                note_type: row.get(4)?,
                                folder: row.get(5)?,
                                updated_at: row.get(6)?,
                                metadata: serde_json::Value::Null,
                            })
                        },
                    )?
                    .collect::<Result<Vec<_>, _>>()?;

                for mut r in note_results {
                    r.snippet = resolve_entity_refs(&r.snippet, conn);
                    seen_ids.insert(format!("note:{}", r.id));
                    results.push(r);
                }
            }

            if do_tasks {
                let mut stmt = conn.prepare(
                    "SELECT t.id, t.title,
                            COALESCE(snippet(tasks_fts, 1, '<mark>', '</mark>', '...', 32),
                                     snippet(tasks_fts, 0, '<mark>', '</mark>', '...', 32),
                                     '') as snippet,
                            rank, t.status, t.priority, t.updated_at
                     FROM tasks_fts
                     JOIN tasks t ON tasks_fts.rowid = t.rowid
                     WHERE tasks_fts MATCH ?1 AND t.workspace_id = ?2 AND t.deleted_at IS NULL
                     ORDER BY rank
                     LIMIT ?3 OFFSET ?4",
                )?;

                let task_results = stmt
                    .query_map(
                        rusqlite::params![sanitized, query.workspace_id, limit, offset],
                        |row| {
                            let status: String = row.get(4)?;
                            let priority: String = row.get(5)?;
                            Ok(SearchResult {
                                entity_type: "task".to_string(),
                                id: row.get(0)?,
                                title: row.get(1)?,
                                snippet: row.get(2)?,
                                rank: row.get(3)?,
                                note_type: None,
                                folder: None,
                                updated_at: row.get(6)?,
                                metadata: serde_json::json!({
                                    "status": status,
                                    "priority": priority,
                                }),
                            })
                        },
                    )?
                    .collect::<Result<Vec<_>, _>>()?;

                for mut r in task_results {
                    r.snippet = resolve_entity_refs(&r.snippet, conn);
                    seen_ids.insert(format!("task:{}", r.id));
                    results.push(r);
                }
            }

            if do_plans {
                let mut stmt = conn.prepare(
                    "SELECT p.id, p.title,
                            COALESCE(snippet(plans_fts, 1, '<mark>', '</mark>', '...', 32),
                                     snippet(plans_fts, 0, '<mark>', '</mark>', '...', 32),
                                     '') as snippet,
                            rank, p.type, p.start_time, p.updated_at
                     FROM plans_fts
                     JOIN plans p ON plans_fts.rowid = p.rowid
                     WHERE plans_fts MATCH ?1 AND p.workspace_id = ?2 AND p.deleted_at IS NULL
                     ORDER BY rank
                     LIMIT ?3 OFFSET ?4",
                )?;

                let plan_results = stmt
                    .query_map(
                        rusqlite::params![sanitized, query.workspace_id, limit, offset],
                        |row| {
                            let plan_type: String = row.get(4)?;
                            let start_time: String = row.get(5)?;
                            Ok(SearchResult {
                                entity_type: "plan".to_string(),
                                id: row.get(0)?,
                                title: row.get(1)?,
                                snippet: row.get(2)?,
                                rank: row.get(3)?,
                                note_type: None,
                                folder: None,
                                updated_at: row.get(6)?,
                                metadata: serde_json::json!({
                                    "plan_type": plan_type,
                                    "start_time": start_time,
                                }),
                            })
                        },
                    )?
                    .collect::<Result<Vec<_>, _>>()?;

                for r in plan_results {
                    seen_ids.insert(format!("plan:{}", r.id));
                    results.push(r);
                }
            }

            // === Phase 2: LIKE substring fallback (for matches FTS5 missed) ===

            if do_notes {
                let mut stmt = conn.prepare(
                    "SELECT id, title, COALESCE(body, ''), type, folder, updated_at
                     FROM notes
                     WHERE workspace_id = ?1 AND deleted_at IS NULL
                       AND (title LIKE ?2 ESCAPE '\\' OR body LIKE ?2 ESCAPE '\\')
                     ORDER BY updated_at DESC
                     LIMIT ?3",
                )?;

                let rows = stmt
                    .query_map(rusqlite::params![query.workspace_id, like_pattern, limit], |row| {
                        let id: String = row.get(0)?;
                        let title: Option<String> = row.get(1)?;
                        let body: String = row.get(2)?;
                        let note_type: Option<String> = row.get(3)?;
                        let folder: Option<String> = row.get(4)?;
                        let updated_at: String = row.get(5)?;
                        Ok((id, title, body, note_type, folder, updated_at))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;

                for (id, title, body, note_type, folder, updated_at) in rows {
                    if seen_ids.contains(&format!("note:{id}")) {
                        continue;
                    }
                    let snippet_text = if !body.is_empty() { &body } else { title.as_deref().unwrap_or("") };
                    let snippet = highlight_snippet(snippet_text, &raw_query);
                    seen_ids.insert(format!("note:{id}"));
                    results.push(SearchResult {
                        entity_type: "note".to_string(),
                        id,
                        title,
                        snippet,
                        rank: 100.0, // Lower priority than FTS5 results
                        note_type,
                        folder,
                        updated_at,
                        metadata: serde_json::Value::Null,
                    });
                }
            }

            if do_tasks {
                let mut stmt = conn.prepare(
                    "SELECT id, title, COALESCE(description, ''), status, priority, updated_at
                     FROM tasks
                     WHERE workspace_id = ?1 AND deleted_at IS NULL
                       AND (title LIKE ?2 ESCAPE '\\' OR description LIKE ?2 ESCAPE '\\')
                     ORDER BY updated_at DESC
                     LIMIT ?3",
                )?;

                let rows = stmt
                    .query_map(rusqlite::params![query.workspace_id, like_pattern, limit], |row| {
                        let id: String = row.get(0)?;
                        let title: Option<String> = row.get(1)?;
                        let desc: String = row.get(2)?;
                        let status: String = row.get(3)?;
                        let priority: String = row.get(4)?;
                        let updated_at: String = row.get(5)?;
                        Ok((id, title, desc, status, priority, updated_at))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;

                for (id, title, desc, status, priority, updated_at) in rows {
                    if seen_ids.contains(&format!("task:{id}")) {
                        continue;
                    }
                    let snippet_text = if !desc.is_empty() { &desc } else { title.as_deref().unwrap_or("") };
                    let snippet = highlight_snippet(snippet_text, &raw_query);
                    seen_ids.insert(format!("task:{id}"));
                    results.push(SearchResult {
                        entity_type: "task".to_string(),
                        id,
                        title,
                        snippet,
                        rank: 100.0,
                        note_type: None,
                        folder: None,
                        updated_at,
                        metadata: serde_json::json!({
                            "status": status,
                            "priority": priority,
                        }),
                    });
                }
            }

            if do_plans {
                let mut stmt = conn.prepare(
                    "SELECT id, title, COALESCE(description, ''), type, start_time, updated_at
                     FROM plans
                     WHERE workspace_id = ?1 AND deleted_at IS NULL
                       AND (title LIKE ?2 ESCAPE '\\' OR description LIKE ?2 ESCAPE '\\')
                     ORDER BY updated_at DESC
                     LIMIT ?3",
                )?;

                let rows = stmt
                    .query_map(rusqlite::params![query.workspace_id, like_pattern, limit], |row| {
                        let id: String = row.get(0)?;
                        let title: Option<String> = row.get(1)?;
                        let desc: String = row.get(2)?;
                        let plan_type: String = row.get(3)?;
                        let start_time: String = row.get(4)?;
                        let updated_at: String = row.get(5)?;
                        Ok((id, title, desc, plan_type, start_time, updated_at))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;

                for (id, title, desc, plan_type, start_time, updated_at) in rows {
                    if seen_ids.contains(&format!("plan:{id}")) {
                        continue;
                    }
                    let snippet_text = if !desc.is_empty() { &desc } else { title.as_deref().unwrap_or("") };
                    let snippet = highlight_snippet(snippet_text, &raw_query);
                    seen_ids.insert(format!("plan:{id}"));
                    results.push(SearchResult {
                        entity_type: "plan".to_string(),
                        id,
                        title,
                        snippet,
                        rank: 100.0,
                        note_type: None,
                        folder: None,
                        updated_at,
                        metadata: serde_json::json!({
                            "plan_type": plan_type,
                            "start_time": start_time,
                        }),
                    });
                }
            }

            // Sort: FTS5 results first (by rank), then LIKE results (by recency)
            results.sort_by(|a, b| a.rank.partial_cmp(&b.rank).unwrap_or(std::cmp::Ordering::Equal));
            results.truncate(limit as usize);

            Ok(results)
        })
        .map_err(AppError::Database)
}
