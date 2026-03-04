use crate::state::AppState;
use crate::utils::errors::AppError;
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
}

/// A single full-text search result with highlighted snippet.
#[derive(Debug, Serialize)]
pub struct SearchResult {
    /// Note identifier.
    pub id: String,
    /// Note title.
    pub title: Option<String>,
    /// FTS5 snippet with highlighted matches.
    pub snippet: String,
    /// FTS5 relevance rank score.
    pub rank: f64,
    /// Note type.
    pub note_type: Option<String>,
    /// Folder path.
    pub folder: Option<String>,
    /// Last modification timestamp.
    pub updated_at: String,
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

/// Performs a full-text search across notes using SQLite FTS5.
///
/// Returns results ranked by relevance with highlighted snippets.
/// Only searches within the specified workspace and excludes soft-deleted notes.
#[tauri::command]
pub fn search_notes(
    state: State<'_, AppState>,
    query: SearchQuery,
) -> Result<Vec<SearchResult>, AppError> {
    let sanitized = sanitize_fts_query(&query.query);
    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);

    state
        .db
        .with_conn(|conn| {
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

            let results = stmt
                .query_map(
                    rusqlite::params![sanitized, query.workspace_id, limit, offset],
                    |row| {
                        Ok(SearchResult {
                            id: row.get(0)?,
                            title: row.get(1)?,
                            snippet: row.get(2)?,
                            rank: row.get(3)?,
                            note_type: row.get(4)?,
                            folder: row.get(5)?,
                            updated_at: row.get(6)?,
                        })
                    },
                )?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(results)
        })
        .map_err(AppError::Database)
}
