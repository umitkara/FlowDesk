use crate::commands::notes::read_note;
use crate::models::export::{CsvExportOptions, EnhancedExportResult, JsonExportOptions, MarkdownExportOptions};
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

/// Exports workspace data (notes + tasks) as JSON.
#[tauri::command]
pub fn export_workspace_json(
    state: State<'_, AppState>,
    options: JsonExportOptions,
) -> Result<EnhancedExportResult, AppError> {
    let notes = if options.include_notes {
        state.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id FROM notes WHERE workspace_id = ?1 AND deleted_at IS NULL",
            )?;
            let ids: Vec<String> = stmt
                .query_map([&options.workspace_id], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            let mut notes = Vec::new();
            for id in ids {
                if let Ok(note) = read_note(conn, &id) {
                    notes.push(note);
                }
            }
            Ok(notes)
        }).map_err(AppError::Database)?
    } else {
        Vec::new()
    };

    let tasks = if options.include_tasks {
        state.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_id, title, description, status, priority,
                        due_date, scheduled_date, completed_at, category, color,
                        tags, estimated_mins, actual_mins, recurrence,
                        parent_task_id, is_sticky, created_at, updated_at, deleted_at
                 FROM tasks WHERE workspace_id = ?1 AND deleted_at IS NULL",
            )?;
            let tasks = stmt
                .query_map([&options.workspace_id], |row| {
                    let tags_str: Option<String> = row.get(11)?;
                    let tags = tags_str
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok());
                    let rec_str: Option<String> = row.get(14)?;
                    let recurrence = rec_str
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok());
                    Ok(crate::models::task::Task {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        title: row.get(2)?,
                        description: row.get(3)?,
                        status: row.get(4)?,
                        priority: row.get(5)?,
                        due_date: row.get(6)?,
                        scheduled_date: row.get(7)?,
                        completed_at: row.get(8)?,
                        category: row.get(9)?,
                        color: row.get(10)?,
                        tags,
                        estimated_mins: row.get(12)?,
                        actual_mins: row.get(13).unwrap_or(0),
                        recurrence,
                        parent_task_id: row.get(15)?,
                        is_sticky: row.get(16)?,
                        created_at: row.get(17)?,
                        updated_at: row.get(18)?,
                        deleted_at: row.get(19)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(tasks)
        }).map_err(AppError::Database)?
    } else {
        Vec::new()
    };

    let json_str = crate::services::export::serialize_workspace_json(
        &notes,
        &tasks,
        options.pretty_print,
    )?;

    std::fs::write(&options.output_path, &json_str)?;

    Ok(EnhancedExportResult {
        exported_count: notes.len() + tasks.len(),
        output_path: options.output_path,
        format: "json".to_string(),
        errors: Vec::new(),
    })
}

/// Exports tasks as CSV.
#[tauri::command]
pub fn export_tasks_csv(
    state: State<'_, AppState>,
    options: CsvExportOptions,
) -> Result<EnhancedExportResult, AppError> {
    let tasks = state.db.with_conn(|conn| {
        let mut sql = String::from(
            "SELECT id, workspace_id, title, description, status, priority,
                    due_date, scheduled_date, completed_at, category, color,
                    tags, estimated_mins, actual_mins, recurrence,
                    parent_task_id, is_sticky, created_at, updated_at, deleted_at
             FROM tasks WHERE workspace_id = ?1 AND deleted_at IS NULL",
        );

        if !options.include_done {
            sql.push_str(" AND status != 'done'");
        }
        if !options.include_cancelled {
            sql.push_str(" AND status != 'cancelled'");
        }

        let mut stmt = conn.prepare(&sql)?;
        let tasks = stmt
            .query_map([&options.workspace_id], |row| {
                let tags_str: Option<String> = row.get(11)?;
                let tags = tags_str.as_deref().and_then(|s| serde_json::from_str(s).ok());
                let rec_str: Option<String> = row.get(14)?;
                let recurrence = rec_str.as_deref().and_then(|s| serde_json::from_str(s).ok());
                Ok(crate::models::task::Task {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    status: row.get(4)?,
                    priority: row.get(5)?,
                    due_date: row.get(6)?,
                    scheduled_date: row.get(7)?,
                    completed_at: row.get(8)?,
                    category: row.get(9)?,
                    color: row.get(10)?,
                    tags,
                    estimated_mins: row.get(12)?,
                    actual_mins: row.get(13).unwrap_or(0),
                    recurrence,
                    parent_task_id: row.get(15)?,
                    is_sticky: row.get(16)?,
                    created_at: row.get(17)?,
                    updated_at: row.get(18)?,
                    deleted_at: row.get(19)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(tasks)
    }).map_err(AppError::Database)?;

    let csv_str = crate::services::export::serialize_tasks_csv(&tasks)?;
    std::fs::write(&options.output_path, &csv_str)?;

    Ok(EnhancedExportResult {
        exported_count: tasks.len(),
        output_path: options.output_path,
        format: "csv".to_string(),
        errors: Vec::new(),
    })
}

/// Enhanced markdown export with more options.
#[tauri::command]
pub fn export_notes_markdown(
    state: State<'_, AppState>,
    options: MarkdownExportOptions,
) -> Result<EnhancedExportResult, AppError> {
    let notes = state.db.with_conn(|conn| {
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
            let ids = stmt.query_map(param_refs.as_slice(), |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            ids
        };

        let mut notes = Vec::new();
        for id in note_ids {
            if let Ok(note) = read_note(conn, &id) {
                notes.push(note);
            }
        }
        Ok(notes)
    }).map_err(AppError::Database)?;

    let output_path = Path::new(&options.output_dir);
    let result = crate::services::export::export_to_directory(&notes, output_path)?;

    Ok(EnhancedExportResult {
        exported_count: result.exported_count as usize,
        output_path: result.output_dir,
        format: "markdown".to_string(),
        errors: result.errors,
    })
}

/// Exports a single note to markdown, returning the string.
#[tauri::command]
pub fn export_single_note_markdown(
    state: State<'_, AppState>,
    id: String,
) -> Result<String, AppError> {
    let note = state.db.with_conn(|conn| {
        read_note(conn, &id).map_err(|e| match e {
            AppError::Database(db_err) => db_err,
            _ => rusqlite::Error::InvalidQuery,
        })
    }).map_err(AppError::Database)?;

    Ok(crate::services::export::note_to_markdown(&note))
}
