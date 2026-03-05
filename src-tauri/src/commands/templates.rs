use crate::models::template::{CreateTemplateInput, NoteTemplate, Suggestion, UpdateTemplateInput};
use crate::services::{suggestions, templates};
use crate::state::AppState;
use crate::utils::errors::AppError;
use std::collections::HashMap;
use tauri::State;

/// Lists all available templates from the templates directory.
#[tauri::command]
pub fn list_templates(state: State<'_, AppState>) -> Result<Vec<NoteTemplate>, AppError> {
    templates::list_templates(&state.data_dir).map_err(AppError::Internal)
}

/// Loads a single template by file name.
#[tauri::command]
pub fn load_template(
    state: State<'_, AppState>,
    file_name: String,
) -> Result<NoteTemplate, AppError> {
    templates::load_template(&state.data_dir, &file_name).map_err(AppError::Internal)
}

/// Creates a new template file on disk.
#[tauri::command]
pub fn create_template(
    state: State<'_, AppState>,
    input: CreateTemplateInput,
) -> Result<String, AppError> {
    if input.file_name.trim().is_empty() {
        return Err(AppError::Validation(
            "Template file name must be non-empty".to_string(),
        ));
    }

    templates::create_template(
        &state.data_dir,
        &input.file_name,
        &input.name,
        &input.description,
        &input.defaults,
        &input.variables,
        &input.body,
    )
    .map_err(AppError::Internal)
}

/// Updates an existing template file.
#[tauri::command]
pub fn update_template(
    state: State<'_, AppState>,
    file_name: String,
    update: UpdateTemplateInput,
) -> Result<(), AppError> {
    templates::update_template(
        &state.data_dir,
        &file_name,
        update.name.as_deref(),
        update.description.as_deref(),
        update.defaults.as_ref(),
        update.variables.as_deref(),
        update.body.as_deref(),
    )
    .map_err(AppError::Internal)
}

/// Deletes a template file.
#[tauri::command]
pub fn delete_template(
    state: State<'_, AppState>,
    file_name: String,
) -> Result<(), AppError> {
    templates::delete_template(&state.data_dir, &file_name).map_err(AppError::Internal)
}

/// Applies a template with variable substitution and returns the result.
#[tauri::command]
pub fn apply_template(
    state: State<'_, AppState>,
    file_name: String,
    variables: HashMap<String, String>,
    workspace_id: String,
    date: Option<String>,
) -> Result<(String, HashMap<String, serde_json::Value>), AppError> {
    let template = templates::load_template(&state.data_dir, &file_name)
        .map_err(AppError::Internal)?;

    // Get workspace name and slug
    let (ws_name, ws_slug) = state
        .db
        .with_conn(|conn| {
            conn.query_row(
                "SELECT name, slug FROM workspaces WHERE id = ?1",
                [&workspace_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
        })
        .map_err(AppError::Database)?;

    let target_date = date.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());

    Ok(templates::apply_template(
        &template,
        &variables,
        &ws_name,
        &ws_slug,
        target_date,
    ))
}

/// Creates a note from a template in one step.
#[tauri::command]
pub fn create_note_from_template(
    state: State<'_, AppState>,
    workspace_id: String,
    template_name: String,
    variables: HashMap<String, String>,
    date: Option<String>,
) -> Result<crate::models::note::Note, AppError> {
    let template = templates::load_template(&state.data_dir, &template_name)
        .map_err(AppError::Internal)?;

    let (ws_name, ws_slug) = state
        .db
        .with_conn(|conn| {
            conn.query_row(
                "SELECT name, slug FROM workspaces WHERE id = ?1",
                [&workspace_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
        })
        .map_err(AppError::Database)?;

    let target_date = date.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());
    let (body, defaults) =
        templates::apply_template(&template, &variables, &ws_name, &ws_slug, target_date);

    let title = defaults
        .get("title")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            // Use template name as default title
            Some(template.name.clone())
        });

    let note_type = defaults
        .get("type")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let category = defaults
        .get("category")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let folder = defaults
        .get("folder")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let importance = defaults
        .get("importance")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let tags: Option<Vec<String>> = defaults.get("tags").and_then(|v| {
        v.as_array().map(|arr| {
            arr.iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect()
        })
    });

    let note_date = target_date
        .map(|d| d.format("%Y-%m-%d").to_string())
        .or_else(|| Some(chrono::Local::now().format("%Y-%m-%d").to_string()));

    // Create the note via IPC-like call
    let id = crate::utils::id::generate_id();
    let now = crate::utils::time::now_iso();
    let tags_json = tags
        .as_ref()
        .map(|t| serde_json::to_string(t).unwrap_or_else(|_| "[]".to_string()));

    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "INSERT INTO notes (id, workspace_id, title, date, body, folder, category,
                    type, color, importance, front_matter, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, NULL, ?10, ?10)",
                rusqlite::params![
                    id,
                    workspace_id,
                    title,
                    note_date,
                    body,
                    folder,
                    category,
                    note_type,
                    importance,
                    now,
                ],
            )?;

            // Sync tags
            if let Some(ref tag_names) = tags {
                for tag_name in tag_names {
                    let tag_id: String = match conn.query_row(
                        "SELECT id FROM tags WHERE workspace_id = ?1 AND name = ?2",
                        rusqlite::params![workspace_id, tag_name],
                        |row| row.get(0),
                    ) {
                        Ok(existing_id) => existing_id,
                        Err(rusqlite::Error::QueryReturnedNoRows) => {
                            let new_tag_id = crate::utils::id::generate_id();
                            conn.execute(
                                "INSERT INTO tags (id, workspace_id, name, created_at) VALUES (?1, ?2, ?3, ?4)",
                                rusqlite::params![new_tag_id, workspace_id, tag_name, now],
                            )?;
                            new_tag_id
                        }
                        Err(e) => return Err(e),
                    };

                    conn.execute(
                        "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                        rusqlite::params![id, tag_id],
                    )?;
                }
            }

            // FTS index
            conn.execute(
                "INSERT INTO notes_fts (rowid, title, body, tags, category, type)
                 VALUES (
                    (SELECT rowid FROM notes WHERE id = ?1),
                    ?2, ?3, ?4, ?5, ?6
                 )",
                rusqlite::params![
                    id,
                    title.as_deref().unwrap_or(""),
                    body,
                    tags_json.as_deref().unwrap_or(""),
                    category.as_deref().unwrap_or(""),
                    note_type.as_deref().unwrap_or(""),
                ],
            )?;

            Ok(())
        })
        .map_err(AppError::Database)?;

    // Read back the note
    state
        .db
        .with_conn(|conn| {
            crate::commands::notes::read_note(conn, &id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })
        })
        .map_err(AppError::Database)
}

/// Ensures built-in templates exist on disk.
#[tauri::command]
pub fn ensure_default_templates(state: State<'_, AppState>) -> Result<(), AppError> {
    templates::ensure_defaults(&state.data_dir).map_err(AppError::Io)
}

/// Gets auto-suggestions when the time tracker stops.
#[tauri::command]
pub fn suggest_on_tracker_stop(
    state: State<'_, AppState>,
    workspace_id: String,
    tags: Vec<String>,
    notes: String,
    stopped_at: String,
) -> Result<Vec<Suggestion>, AppError> {
    state
        .db
        .with_conn(|conn| {
            suggestions::suggest_on_tracker_stop(conn, &workspace_id, &tags, &notes, &stopped_at)
        })
        .map_err(AppError::Database)
}
