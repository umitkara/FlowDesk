use crate::models::workspace::Workspace;
use crate::state::AppState;
use crate::utils::errors::AppError;
use tauri::State;

/// Returns all workspaces, ordered by `sort_order`.
#[tauri::command]
pub fn list_workspaces(
    state: State<'_, AppState>,
) -> Result<Vec<Workspace>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, slug, icon, color, export_path, sort_order, config,
                        created_at, updated_at
                 FROM workspaces ORDER BY sort_order",
            )?;
            let workspaces = stmt
                .query_map([], |row| {
                    let config_str: Option<String> = row.get(7)?;
                    let config = config_str.and_then(|s| serde_json::from_str(&s).ok());
                    Ok(Workspace {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        slug: row.get(2)?,
                        icon: row.get(3)?,
                        color: row.get(4)?,
                        export_path: row.get(5)?,
                        sort_order: row.get(6)?,
                        config,
                        created_at: row.get(8)?,
                        updated_at: row.get(9)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(workspaces)
        })
        .map_err(AppError::Database)
}

/// Retrieves a single workspace by ID.
#[tauri::command]
pub fn get_workspace(
    state: State<'_, AppState>,
    id: String,
) -> Result<Workspace, AppError> {
    state
        .db
        .with_conn(|conn| {
            conn.query_row(
                "SELECT id, name, slug, icon, color, export_path, sort_order, config,
                        created_at, updated_at
                 FROM workspaces WHERE id = ?1",
                [&id],
                |row| {
                    let cs: Option<String> = row.get(7)?;
                    let config = cs.and_then(|s| serde_json::from_str(&s).ok());
                    Ok(Workspace {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        slug: row.get(2)?,
                        icon: row.get(3)?,
                        color: row.get(4)?,
                        export_path: row.get(5)?,
                        sort_order: row.get(6)?,
                        config,
                        created_at: row.get(8)?,
                        updated_at: row.get(9)?,
                    })
                },
            )
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "Workspace".to_string(),
                    id,
                }
            } else {
                AppError::Database(e)
            }
        })
}
