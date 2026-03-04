use crate::commands::notes::read_note;
use crate::state::AppState;
use crate::utils::errors::AppError;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

/// Options for a batch note export operation.
#[derive(Debug, Deserialize)]
pub struct ExportOptions {
    /// Workspace to export from.
    pub workspace_id: String,
    /// Specific note IDs to export (if None, exports all).
    pub note_ids: Option<Vec<String>>,
    /// Export only notes in this folder.
    pub folder: Option<String>,
    /// Target output directory path.
    pub output_dir: String,
    /// Whether to include YAML front matter in exported files.
    pub include_front_matter: bool,
}

/// Result of a batch export operation.
#[derive(Debug, Serialize)]
pub struct ExportResult {
    /// Number of notes successfully exported.
    pub exported_count: i32,
    /// Absolute path to the output directory.
    pub output_dir: String,
    /// Error messages for notes that failed to export.
    pub errors: Vec<String>,
}

/// Exports notes to markdown files in the specified directory.
///
/// Supports exporting specific notes by ID, notes in a folder, or all
/// notes in a workspace. Preserves folder structure in the output directory.
#[tauri::command]
pub fn export_notes(
    state: State<'_, AppState>,
    options: ExportOptions,
) -> Result<ExportResult, AppError> {
    let notes = state
        .db
        .with_conn(|conn| {
            let note_ids: Vec<String> = if let Some(ref ids) = options.note_ids {
                ids.clone()
            } else {
                let mut sql = String::from(
                    "SELECT id FROM notes WHERE workspace_id = ?1 AND deleted_at IS NULL",
                );
                let mut params: Vec<Box<dyn rusqlite::types::ToSql>> =
                    vec![Box::new(options.workspace_id.clone())];

                if let Some(ref folder) = options.folder {
                    sql.push_str(" AND folder = ?2");
                    params.push(Box::new(folder.clone()));
                }

                let param_refs: Vec<&dyn rusqlite::types::ToSql> =
                    params.iter().map(|p| p.as_ref()).collect();

                let mut stmt = conn.prepare(&sql)?;
                let ids = stmt
                    .query_map(param_refs.as_slice(), |row| row.get::<_, String>(0))?
                    .collect::<Result<Vec<_>, _>>()?;
                ids
            };

            let mut notes = Vec::new();
            for id in note_ids {
                match read_note(conn, &id) {
                    Ok(note) => notes.push(note),
                    Err(AppError::Database(e)) => return Err(e),
                    Err(_) => {} // skip non-database errors
                }
            }

            Ok(notes)
        })
        .map_err(AppError::Database)?;

    let output_path = Path::new(&options.output_dir);
    let result = crate::services::export::export_to_directory(&notes, output_path)?;

    Ok(ExportResult {
        exported_count: result.exported_count,
        output_dir: result.output_dir,
        errors: result.errors,
    })
}

/// Returns the complete markdown string (with YAML front matter) for a single note.
///
/// Useful for clipboard copy operations.
#[tauri::command]
pub fn export_single_note(
    state: State<'_, AppState>,
    id: String,
) -> Result<String, AppError> {
    let note = state
        .db
        .with_conn(|conn| {
            read_note(conn, &id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })
        })
        .map_err(AppError::Database)?;

    Ok(crate::services::export::note_to_markdown(&note))
}
