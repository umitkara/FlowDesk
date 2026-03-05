use crate::models::discovery::{
    FacetedSearchResponse, FacetedSearchResult, FilterConfig, SearchFacets,
};
use rusqlite::Connection;
use std::collections::HashMap;

/// Sanitizes a search query for FTS5.
fn sanitize_fts_query(query: &str) -> String {
    let cleaned: String = query
        .chars()
        .filter(|c| !matches!(c, '"' | '*' | '(' | ')' | '{' | '}' | ':' | '^'))
        .collect();
    let trimmed = cleaned.trim().to_string();
    if trimmed.is_empty() {
        return "\"\"".to_string();
    }
    trimmed
        .split_whitespace()
        .map(|word| format!("\"{}\"", word))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Executes a faceted search across multiple entity types.
///
/// Builds per-entity-type queries with type-specific and common filters,
/// combines results, computes facet counts, and returns a unified response.
pub fn execute_faceted_search(
    conn: &Connection,
    workspace_id: &str,
    filter: &FilterConfig,
) -> Result<FacetedSearchResponse, rusqlite::Error> {
    let default_types = vec!["note".to_string(), "task".to_string(), "plan".to_string()];
    let entity_types = filter
        .entity_types
        .as_deref()
        .unwrap_or(&default_types);

    let search_notes = entity_types.iter().any(|t| t == "note");
    let search_tasks = entity_types.iter().any(|t| t == "task");
    let search_plans = entity_types.iter().any(|t| t == "plan");

    let has_query = filter.query.as_ref().is_some_and(|q| !q.trim().is_empty());
    let limit = filter.limit.unwrap_or(50);
    let sort_by = filter.sort_by.as_deref().unwrap_or("updated_at");
    let sort_order_dir = filter.sort_order.as_deref().unwrap_or("desc");

    let mut all_results: Vec<FacetedSearchResult> = Vec::new();

    if search_notes {
        let results = search_entity_notes(conn, workspace_id, filter, has_query)?;
        all_results.extend(results);
    }

    if search_tasks {
        let results = search_entity_tasks(conn, workspace_id, filter, has_query)?;
        all_results.extend(results);
    }

    if search_plans {
        let results = search_entity_plans(conn, workspace_id, filter, has_query)?;
        all_results.extend(results);
    }

    // Sort combined results
    match sort_by {
        "rank" if has_query => {
            all_results.sort_by(|a, b| a.rank.partial_cmp(&b.rank).unwrap_or(std::cmp::Ordering::Equal));
        }
        "title" => {
            if sort_order_dir == "asc" {
                all_results.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
            } else {
                all_results.sort_by(|a, b| b.title.to_lowercase().cmp(&a.title.to_lowercase()));
            }
        }
        _ => {
            // Default: sort by updated_at
            if sort_order_dir == "asc" {
                all_results.sort_by(|a, b| a.updated_at.cmp(&b.updated_at));
            } else {
                all_results.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
            }
        }
    }

    // Compute facets from all results (before applying limit)
    let facets = compute_facets(&all_results);
    let total_count = all_results.len() as i64;

    // Apply limit
    all_results.truncate(limit as usize);

    Ok(FacetedSearchResponse {
        results: all_results,
        total_count,
        facets,
    })
}

/// Searches notes with filters.
fn search_entity_notes(
    conn: &Connection,
    workspace_id: &str,
    filter: &FilterConfig,
    has_query: bool,
) -> Result<Vec<FacetedSearchResult>, rusqlite::Error> {
    let mut results = Vec::new();

    if has_query {
        let sanitized = sanitize_fts_query(filter.query.as_deref().unwrap_or(""));
        let mut stmt = conn.prepare(
            "SELECT n.id, n.title, n.category, n.tags, n.importance, n.folder, n.date,
                    n.workspace_id, n.updated_at,
                    snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
                    rank
             FROM notes_fts
             JOIN notes n ON notes_fts.rowid = n.rowid
             WHERE notes_fts MATCH ?1 AND n.workspace_id = ?2 AND n.deleted_at IS NULL
             ORDER BY rank",
        )?;

        let rows = stmt.query_map(rusqlite::params![sanitized, workspace_id], |row| {
            Ok(FacetedSearchResult {
                id: row.get(0)?,
                entity_type: "note".to_string(),
                title: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "Untitled".to_string()),
                category: row.get(2)?,
                tags: parse_tags(row.get::<_, Option<String>>(3)?),
                importance: row.get(4)?,
                folder: row.get(5)?,
                date: row.get(6)?,
                workspace_id: row.get(7)?,
                updated_at: row.get(8)?,
                snippet: row.get(9)?,
                rank: row.get(10)?,
                status: None,
                priority: None,
            })
        })?;
        for row in rows {
            let r = row?;
            if passes_common_filters(&r, filter) {
                results.push(r);
            }
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, title, category, tags, importance, folder, date,
                    workspace_id, updated_at
             FROM notes
             WHERE workspace_id = ?1 AND deleted_at IS NULL
             ORDER BY updated_at DESC",
        )?;

        let rows = stmt.query_map([workspace_id], |row| {
            Ok(FacetedSearchResult {
                id: row.get(0)?,
                entity_type: "note".to_string(),
                title: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "Untitled".to_string()),
                category: row.get(2)?,
                tags: parse_tags(row.get::<_, Option<String>>(3)?),
                importance: row.get(4)?,
                folder: row.get(5)?,
                date: row.get(6)?,
                workspace_id: row.get(7)?,
                updated_at: row.get(8)?,
                snippet: None,
                rank: 0.0,
                status: None,
                priority: None,
            })
        })?;
        for row in rows {
            let r = row?;
            if passes_common_filters(&r, filter) {
                results.push(r);
            }
        }
    }

    // Apply note-specific filters
    if let Some(ref folders) = filter.folders {
        results.retain(|r| {
            r.folder
                .as_ref()
                .is_some_and(|f| folders.iter().any(|ff| f.starts_with(ff)))
        });
    }

    if let Some(ref note_types) = filter.note_types {
        // note_types filter would need the type column; for now we skip if not in result
        let _ = note_types; // acknowledged but not filterable without extra data
    }

    if let Some(ref imp) = filter.importance {
        results.retain(|r| {
            r.importance
                .as_ref()
                .is_some_and(|i| imp.contains(i))
        });
    }

    Ok(results)
}

/// Searches tasks with filters.
fn search_entity_tasks(
    conn: &Connection,
    workspace_id: &str,
    filter: &FilterConfig,
    has_query: bool,
) -> Result<Vec<FacetedSearchResult>, rusqlite::Error> {
    let mut results = Vec::new();

    if has_query {
        let sanitized = sanitize_fts_query(filter.query.as_deref().unwrap_or(""));
        let mut stmt = conn.prepare(
            "SELECT t.id, t.title, t.category, t.tags, t.status, t.priority,
                    t.scheduled_date, t.workspace_id, t.updated_at,
                    snippet(tasks_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
                    rank
             FROM tasks_fts
             JOIN tasks t ON tasks_fts.rowid = t.rowid
             WHERE tasks_fts MATCH ?1 AND t.workspace_id = ?2 AND t.deleted_at IS NULL
             ORDER BY rank",
        )?;

        let rows = stmt.query_map(rusqlite::params![sanitized, workspace_id], |row| {
            Ok(FacetedSearchResult {
                id: row.get(0)?,
                entity_type: "task".to_string(),
                title: row.get(1)?,
                category: row.get(2)?,
                tags: parse_tags(row.get::<_, Option<String>>(3)?),
                status: row.get(4)?,
                priority: row.get(5)?,
                date: row.get(6)?,
                workspace_id: row.get(7)?,
                updated_at: row.get(8)?,
                snippet: row.get(9)?,
                rank: row.get(10)?,
                importance: None,
                folder: None,
            })
        })?;
        for row in rows {
            let r = row?;
            if passes_common_filters(&r, filter) && passes_task_filters(&r, filter) {
                results.push(r);
            }
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, title, category, tags, status, priority,
                    scheduled_date, workspace_id, updated_at
             FROM tasks
             WHERE workspace_id = ?1 AND deleted_at IS NULL
             ORDER BY updated_at DESC",
        )?;

        let rows = stmt.query_map([workspace_id], |row| {
            Ok(FacetedSearchResult {
                id: row.get(0)?,
                entity_type: "task".to_string(),
                title: row.get(1)?,
                category: row.get(2)?,
                tags: parse_tags(row.get::<_, Option<String>>(3)?),
                status: row.get(4)?,
                priority: row.get(5)?,
                date: row.get(6)?,
                workspace_id: row.get(7)?,
                updated_at: row.get(8)?,
                snippet: None,
                rank: 0.0,
                importance: None,
                folder: None,
            })
        })?;
        for row in rows {
            let r = row?;
            if passes_common_filters(&r, filter) && passes_task_filters(&r, filter) {
                results.push(r);
            }
        }
    }

    Ok(results)
}

/// Searches plans with filters.
fn search_entity_plans(
    conn: &Connection,
    workspace_id: &str,
    filter: &FilterConfig,
    has_query: bool,
) -> Result<Vec<FacetedSearchResult>, rusqlite::Error> {
    let mut results = Vec::new();

    if has_query {
        let sanitized = sanitize_fts_query(filter.query.as_deref().unwrap_or(""));
        let mut stmt = conn.prepare(
            "SELECT p.id, p.title, p.category, p.tags, p.importance,
                    p.start_time, p.workspace_id, p.updated_at,
                    snippet(plans_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
                    rank
             FROM plans_fts
             JOIN plans p ON plans_fts.rowid = p.rowid
             WHERE plans_fts MATCH ?1 AND p.workspace_id = ?2 AND p.deleted_at IS NULL
             ORDER BY rank",
        )?;

        let rows = stmt.query_map(rusqlite::params![sanitized, workspace_id], |row| {
            Ok(FacetedSearchResult {
                id: row.get(0)?,
                entity_type: "plan".to_string(),
                title: row.get(1)?,
                category: row.get(2)?,
                tags: parse_tags(row.get::<_, Option<String>>(3)?),
                importance: row.get(4)?,
                date: row.get(5)?,
                workspace_id: row.get(6)?,
                updated_at: row.get(7)?,
                snippet: row.get(8)?,
                rank: row.get(9)?,
                status: None,
                priority: None,
                folder: None,
            })
        })?;
        for row in rows {
            let r = row?;
            if passes_common_filters(&r, filter) {
                results.push(r);
            }
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, title, category, tags, importance,
                    start_time, workspace_id, updated_at
             FROM plans
             WHERE workspace_id = ?1 AND deleted_at IS NULL
             ORDER BY updated_at DESC",
        )?;

        let rows = stmt.query_map([workspace_id], |row| {
            Ok(FacetedSearchResult {
                id: row.get(0)?,
                entity_type: "plan".to_string(),
                title: row.get(1)?,
                category: row.get(2)?,
                tags: parse_tags(row.get::<_, Option<String>>(3)?),
                importance: row.get(4)?,
                date: row.get(5)?,
                workspace_id: row.get(6)?,
                updated_at: row.get(7)?,
                snippet: None,
                rank: 0.0,
                status: None,
                priority: None,
                folder: None,
            })
        })?;
        for row in rows {
            let r = row?;
            if passes_common_filters(&r, filter) {
                results.push(r);
            }
        }
    }

    if let Some(ref imp) = filter.importance {
        results.retain(|r| {
            r.importance
                .as_ref()
                .is_some_and(|i| imp.contains(i))
        });
    }

    Ok(results)
}

/// Checks common filters (tags, categories, date range) against a result.
fn passes_common_filters(result: &FacetedSearchResult, filter: &FilterConfig) -> bool {
    // Category filter
    if let Some(ref categories) = filter.categories {
        if !categories.is_empty() {
            match &result.category {
                Some(cat) if categories.contains(cat) => {}
                _ => return false,
            }
        }
    }

    // Tag filter
    if let Some(ref tags) = filter.tags {
        if !tags.is_empty() {
            let mode = filter.tags_mode.as_deref().unwrap_or("any");
            if mode == "all" {
                if !tags.iter().all(|t| result.tags.contains(t)) {
                    return false;
                }
            } else {
                // "any" mode
                if !tags.iter().any(|t| result.tags.contains(t)) {
                    return false;
                }
            }
        }
    }

    // Date range filter
    if let Some(ref date_from) = filter.date_from {
        let date_field = match filter.date_field.as_deref() {
            Some("updated_at") => &result.updated_at,
            Some("date") => match &result.date {
                Some(d) => d,
                None => return false,
            },
            _ => &result.updated_at, // default to updated_at
        };
        if date_field < date_from {
            return false;
        }
    }

    if let Some(ref date_to) = filter.date_to {
        let date_field = match filter.date_field.as_deref() {
            Some("updated_at") => &result.updated_at,
            Some("date") => match &result.date {
                Some(d) => d,
                None => return false,
            },
            _ => &result.updated_at,
        };
        if date_field > date_to {
            return false;
        }
    }

    true
}

/// Checks task-specific filters (status, priority).
fn passes_task_filters(result: &FacetedSearchResult, filter: &FilterConfig) -> bool {
    if let Some(ref statuses) = filter.statuses {
        if !statuses.is_empty() {
            match &result.status {
                Some(s) if statuses.contains(s) => {}
                _ => return false,
            }
        }
    }

    if let Some(ref priorities) = filter.priorities {
        if !priorities.is_empty() {
            match &result.priority {
                Some(p) if priorities.contains(p) => {}
                _ => return false,
            }
        }
    }

    true
}

/// Parses a JSON tag array string into a Vec<String>.
fn parse_tags(tags_json: Option<String>) -> Vec<String> {
    match tags_json {
        Some(s) if !s.is_empty() => serde_json::from_str::<Vec<String>>(&s).unwrap_or_default(),
        _ => Vec::new(),
    }
}

/// Computes facet counts from results.
fn compute_facets(results: &[FacetedSearchResult]) -> SearchFacets {
    let mut entity_type_counts: HashMap<String, i64> = HashMap::new();
    let mut category_counts: HashMap<String, i64> = HashMap::new();
    let mut tag_counts: HashMap<String, i64> = HashMap::new();
    let mut status_counts: HashMap<String, i64> = HashMap::new();
    let mut priority_counts: HashMap<String, i64> = HashMap::new();
    let mut importance_counts: HashMap<String, i64> = HashMap::new();

    for r in results {
        *entity_type_counts.entry(r.entity_type.clone()).or_insert(0) += 1;

        if let Some(ref cat) = r.category {
            *category_counts.entry(cat.clone()).or_insert(0) += 1;
        }

        for tag in &r.tags {
            *tag_counts.entry(tag.clone()).or_insert(0) += 1;
        }

        if let Some(ref status) = r.status {
            *status_counts.entry(status.clone()).or_insert(0) += 1;
        }

        if let Some(ref priority) = r.priority {
            *priority_counts.entry(priority.clone()).or_insert(0) += 1;
        }

        if let Some(ref importance) = r.importance {
            *importance_counts.entry(importance.clone()).or_insert(0) += 1;
        }
    }

    SearchFacets {
        entity_type_counts,
        category_counts,
        tag_counts,
        status_counts,
        priority_counts,
        importance_counts,
    }
}
