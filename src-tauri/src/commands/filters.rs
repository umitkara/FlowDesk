use crate::models::discovery::{CreateFilterInput, FilterConfig, SavedFilter, UpdateFilterInput};
use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::id::generate_id;
use crate::utils::time::now_iso;
use tauri::State;

/// Reads a saved filter row from the database.
fn read_filter(
    conn: &rusqlite::Connection,
    id: &str,
) -> Result<SavedFilter, rusqlite::Error> {
    conn.query_row(
        "SELECT id, workspace_id, name, description, filter_config, sort_order, pinned, created_at, updated_at
         FROM saved_filters WHERE id = ?1",
        [id],
        |row| {
            let config_str: String = row.get(4)?;
            let filter_config: FilterConfig =
                serde_json::from_str(&config_str).unwrap_or_default();

            Ok(SavedFilter {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                filter_config,
                sort_order: row.get(5)?,
                pinned: row.get::<_, i32>(6)? != 0,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )
}

/// Creates a new saved filter.
#[tauri::command]
pub fn create_saved_filter(
    state: State<'_, AppState>,
    input: CreateFilterInput,
) -> Result<SavedFilter, AppError> {
    let id = generate_id();
    let now = now_iso();
    let config_json =
        serde_json::to_string(&input.filter_config).map_err(AppError::Serialization)?;
    let pinned = if input.pinned.unwrap_or(false) { 1 } else { 0 };

    state
        .db
        .with_conn(|conn| {
            let max_order: i32 = conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), -1) FROM saved_filters WHERE workspace_id = ?1",
                    [&input.workspace_id],
                    |row| row.get(0),
                )
                .unwrap_or(-1);

            conn.execute(
                "INSERT INTO saved_filters (id, workspace_id, name, description, filter_config, sort_order, pinned, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    id,
                    input.workspace_id,
                    input.name,
                    input.description,
                    config_json,
                    max_order + 1,
                    pinned,
                    now,
                    now,
                ],
            )?;

            read_filter(conn, &id)
        })
        .map_err(AppError::Database)
}

/// Gets a saved filter by ID.
#[tauri::command]
pub fn get_saved_filter(
    state: State<'_, AppState>,
    id: String,
) -> Result<SavedFilter, AppError> {
    state
        .db
        .with_conn(|conn| read_filter(conn, &id))
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "SavedFilter".to_string(),
                    id,
                }
            } else {
                AppError::Database(e)
            }
        })
}

/// Updates an existing saved filter.
#[tauri::command]
pub fn update_saved_filter(
    state: State<'_, AppState>,
    id: String,
    input: UpdateFilterInput,
) -> Result<SavedFilter, AppError> {
    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            // Verify it exists
            let _existing = read_filter(conn, &id)?;

            if let Some(ref name) = input.name {
                conn.execute(
                    "UPDATE saved_filters SET name = ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![name, now, id],
                )?;
            }

            if let Some(ref desc) = input.description {
                conn.execute(
                    "UPDATE saved_filters SET description = ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![desc, now, id],
                )?;
            }

            if let Some(ref config) = input.filter_config {
                let config_json = serde_json::to_string(config).unwrap_or_default();
                conn.execute(
                    "UPDATE saved_filters SET filter_config = ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![config_json, now, id],
                )?;
            }

            if let Some(pinned) = input.pinned {
                let p = if pinned { 1 } else { 0 };
                conn.execute(
                    "UPDATE saved_filters SET pinned = ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![p, now, id],
                )?;
            }

            read_filter(conn, &id)
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "SavedFilter".to_string(),
                    id,
                }
            } else {
                AppError::Database(e)
            }
        })
}

/// Deletes a saved filter by ID.
#[tauri::command]
pub fn delete_saved_filter(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let affected = state
        .db
        .with_conn(|conn| {
            conn.execute("DELETE FROM saved_filters WHERE id = ?1", [&id])
        })?;

    if affected == 0 {
        return Err(AppError::NotFound {
            entity: "SavedFilter".to_string(),
            id,
        });
    }
    Ok(())
}

/// Lists saved filters for a workspace, pinned first, then by sort_order.
#[tauri::command]
pub fn list_saved_filters(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<SavedFilter>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_id, name, description, filter_config, sort_order, pinned, created_at, updated_at
                 FROM saved_filters
                 WHERE workspace_id = ?1
                 ORDER BY pinned DESC, sort_order ASC",
            )?;

            let filters = stmt
                .query_map([&workspace_id], |row| {
                    let config_str: String = row.get(4)?;
                    let filter_config: FilterConfig =
                        serde_json::from_str(&config_str).unwrap_or_default();

                    Ok(SavedFilter {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        name: row.get(2)?,
                        description: row.get(3)?,
                        filter_config,
                        sort_order: row.get(5)?,
                        pinned: row.get::<_, i32>(6)? != 0,
                        created_at: row.get(7)?,
                        updated_at: row.get(8)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(filters)
        })
        .map_err(AppError::Database)
}

/// Reorders saved filters by updating sort_order based on the provided ID list.
#[tauri::command]
pub fn reorder_saved_filters(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<(), AppError> {
    state
        .db
        .with_conn(|conn| {
            for (i, id) in ids.iter().enumerate() {
                conn.execute(
                    "UPDATE saved_filters SET sort_order = ?1 WHERE id = ?2",
                    rusqlite::params![i as i32, id],
                )?;
            }
            Ok(())
        })
        .map_err(AppError::Database)
}
