use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::text::resolve_entity_refs;
use serde::{Deserialize, Serialize};
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
    /// Entity type: "note" or "task".
    pub entity_type: String,
    /// Entity identifier.
    pub id: String,
    /// Entity title.
    pub title: Option<String>,
    /// FTS5 snippet with highlighted matches.
    pub snippet: String,
    /// FTS5 relevance rank score.
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
    // Remove FTS5 special characters that could cause parse errors
    let cleaned: String = query
        .chars()
        .filter(|c| !matches!(c, '"' | '*' | '(' | ')' | '{' | '}' | ':' | '^'))
        .collect();
    let trimmed = cleaned.trim().to_string();
    if trimmed.is_empty() {
        return "\"\"".to_string();
    }
    // Wrap each word in quotes for exact matching
    trimmed
        .split_whitespace()
        .map(|word| format!("\"{}\"", word))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Performs a full-text search across notes and tasks using SQLite FTS5.
///
/// Returns results ranked by relevance with highlighted snippets.
/// Only searches within the specified workspace and excludes soft-deleted entities.
/// Supports filtering by entity type.
#[tauri::command]
pub fn search_notes(
    state: State<'_, AppState>,
    query: SearchQuery,
) -> Result<Vec<SearchResult>, AppError> {
    let sanitized = sanitize_fts_query(&query.query);
    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);
    let entity_types = query.entity_types.as_deref();

    let search_notes = entity_types.is_none()
        || entity_types.is_some_and(|types| types.iter().any(|t| t == "note"));
    let search_tasks = entity_types.is_none()
        || entity_types.is_some_and(|types| types.iter().any(|t| t == "task"));

    state
        .db
        .with_conn(|conn| {
            let mut results: Vec<SearchResult> = Vec::new();

            // Search notes
            if search_notes {
                let mut stmt = conn.prepare(
                    "SELECT n.id, n.title,
                            snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
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

                results.extend(note_results.into_iter().map(|mut r| {
                    r.snippet = resolve_entity_refs(&r.snippet, conn);
                    r
                }));
            }

            // Search tasks
            if search_tasks {
                let mut stmt = conn.prepare(
                    "SELECT t.id, t.title,
                            snippet(tasks_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
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

                results.extend(task_results.into_iter().map(|mut r| {
                    r.snippet = resolve_entity_refs(&r.snippet, conn);
                    r
                }));
            }

            // Sort combined results by rank (lower is better for FTS5)
            results.sort_by(|a, b| a.rank.partial_cmp(&b.rank).unwrap_or(std::cmp::Ordering::Equal));

            // Apply combined limit
            results.truncate(limit as usize);

            Ok(results)
        })
        .map_err(AppError::Database)
}
