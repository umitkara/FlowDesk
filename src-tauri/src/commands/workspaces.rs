use crate::models::workspace::*;
use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::id::generate_id;
use crate::utils::time::{now_iso, today_iso};
use tauri::State;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Reads a full `Workspace` row by ID (excludes soft-deleted).
fn read_workspace(conn: &rusqlite::Connection, id: &str) -> Result<Workspace, AppError> {
    conn.query_row(
        "SELECT id, name, slug, icon, color, export_path, attachment_path,
                sort_order, config, created_at, updated_at, deleted_at
         FROM workspaces WHERE id = ?1 AND deleted_at IS NULL",
        [id],
        |row| {
            let config_str: Option<String> = row.get(8)?;
            let config: WorkspaceConfig = config_str
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default();
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                slug: row.get(2)?,
                icon: row.get(3)?,
                color: row.get(4)?,
                export_path: row.get(5)?,
                attachment_path: row.get(6)?,
                sort_order: row.get(7)?,
                config,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                deleted_at: row.get(11)?,
            })
        },
    )
    .map_err(|e| {
        if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
            AppError::NotFound {
                entity: "Workspace".to_string(),
                id: id.to_string(),
            }
        } else {
            AppError::Database(e)
        }
    })
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Returns all active workspaces with note/task counts, ordered by `sort_order`.
#[tauri::command]
pub fn list_workspaces(
    state: State<'_, AppState>,
) -> Result<Vec<WorkspaceSummary>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT w.id, w.name, w.slug, w.icon, w.color, w.sort_order,
                        (SELECT COUNT(*) FROM notes n WHERE n.workspace_id = w.id AND n.deleted_at IS NULL) AS note_count,
                        (SELECT COUNT(*) FROM tasks t WHERE t.workspace_id = w.id AND t.deleted_at IS NULL) AS task_count
                 FROM workspaces w
                 WHERE w.deleted_at IS NULL
                 ORDER BY w.sort_order",
            )?;
            let rows = stmt
                .query_map([], |row| {
                    Ok(WorkspaceSummary {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        slug: row.get(2)?,
                        icon: row.get(3)?,
                        color: row.get(4)?,
                        sort_order: row.get(5)?,
                        note_count: row.get(6)?,
                        task_count: row.get(7)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
        .map_err(AppError::Database)
}

/// Retrieves a single workspace by ID with full config.
#[tauri::command]
pub fn get_workspace(
    state: State<'_, AppState>,
    id: String,
) -> Result<Workspace, AppError> {
    state
        .db
        .with_conn(|conn| read_workspace(conn, &id).map_err(|e| match e {
            AppError::Database(db) => db,
            AppError::NotFound { .. } => rusqlite::Error::QueryReturnedNoRows,
            _ => rusqlite::Error::InvalidQuery,
        }))
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

/// Creates a new workspace.
#[tauri::command]
pub fn create_workspace(
    state: State<'_, AppState>,
    input: CreateWorkspaceInput,
) -> Result<Workspace, AppError> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Validation("Workspace name cannot be empty".to_string()));
    }

    let id = generate_id();
    let now = now_iso();
    let slug = slugify(&name);
    let config = input.config.unwrap_or_default();
    let config_json = serde_json::to_string(&config).map_err(AppError::Serialization)?;

    state
        .db
        .with_conn(|conn| {
            // Check slug uniqueness
            let exists: bool = conn.query_row(
                "SELECT COUNT(*) > 0 FROM workspaces WHERE slug = ?1 AND deleted_at IS NULL",
                [&slug],
                |row| row.get(0),
            )?;
            if exists {
                return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                    std::io::Error::other("WORKSPACE_SLUG_CONFLICT"),
                )));
            }

            // Next sort_order
            let next_order: i32 = conn.query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM workspaces WHERE deleted_at IS NULL",
                [],
                |row| row.get(0),
            )?;

            conn.execute(
                "INSERT INTO workspaces (id, name, slug, icon, color, export_path, attachment_path,
                                         sort_order, config, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                rusqlite::params![
                    id,
                    name,
                    slug,
                    input.icon,
                    input.color.as_deref().or(Some(&config.accent_color)),
                    input.export_path,
                    Option::<String>::None,
                    next_order,
                    config_json,
                    now,
                    now,
                ],
            )?;
            Ok(())
        })
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("WORKSPACE_SLUG_CONFLICT") {
                AppError::Validation(format!("A workspace with slug '{}' already exists", slug))
            } else {
                AppError::Database(e)
            }
        })?;

    state
        .db
        .with_conn(|conn| read_workspace(conn, &id).map_err(|e| match e {
            AppError::Database(db) => db,
            _ => rusqlite::Error::InvalidQuery,
        }))
        .map_err(AppError::Database)
}

/// Updates workspace metadata and/or config.
#[tauri::command]
pub fn update_workspace(
    state: State<'_, AppState>,
    input: UpdateWorkspaceInput,
) -> Result<Workspace, AppError> {
    let now = now_iso();
    let id = input.id.clone();

    state
        .db
        .with_conn(|conn| {
            let mut set_clauses = vec!["updated_at = ?1".to_string()];
            let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now.clone())];
            let mut idx = 2;

            if let Some(ref name) = input.name {
                let trimmed = name.trim();
                if trimmed.is_empty() {
                    return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                        std::io::Error::other("WORKSPACE_NAME_EMPTY"),
                    )));
                }
                set_clauses.push(format!("name = ?{}", idx));
                params.push(Box::new(trimmed.to_string()));
                idx += 1;

                let new_slug = slugify(trimmed);
                let conflict: bool = conn.query_row(
                    "SELECT COUNT(*) > 0 FROM workspaces WHERE slug = ?1 AND id != ?2 AND deleted_at IS NULL",
                    rusqlite::params![new_slug, input.id],
                    |row| row.get(0),
                )?;
                if conflict {
                    return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                        std::io::Error::other("WORKSPACE_SLUG_CONFLICT"),
                    )));
                }
                set_clauses.push(format!("slug = ?{}", idx));
                params.push(Box::new(new_slug));
                idx += 1;
            }

            if let Some(ref icon) = input.icon {
                set_clauses.push(format!("icon = ?{}", idx));
                params.push(Box::new(icon.clone()));
                idx += 1;
            }

            if let Some(ref color) = input.color {
                set_clauses.push(format!("color = ?{}", idx));
                params.push(Box::new(color.clone()));
                idx += 1;
            }

            if let Some(ref path) = input.export_path {
                set_clauses.push(format!("export_path = ?{}", idx));
                params.push(Box::new(path.clone()));
                idx += 1;
            }

            if let Some(ref path) = input.attachment_path {
                set_clauses.push(format!("attachment_path = ?{}", idx));
                params.push(Box::new(path.clone()));
                idx += 1;
            }

            if let Some(order) = input.sort_order {
                set_clauses.push(format!("sort_order = ?{}", idx));
                params.push(Box::new(order));
                idx += 1;
            }

            if let Some(ref config) = input.config {
                let json = serde_json::to_string(config).unwrap_or_else(|_| "{}".to_string());
                set_clauses.push(format!("config = ?{}", idx));
                params.push(Box::new(json));
                idx += 1;
            }

            let _ = idx;

            let sql = format!(
                "UPDATE workspaces SET {} WHERE id = ?{} AND deleted_at IS NULL",
                set_clauses.join(", "),
                params.len() + 1
            );
            params.push(Box::new(input.id.clone()));

            let param_refs: Vec<&dyn rusqlite::types::ToSql> =
                params.iter().map(|p| p.as_ref()).collect();
            conn.execute(&sql, param_refs.as_slice())?;

            Ok(())
        })
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("WORKSPACE_SLUG_CONFLICT") {
                AppError::Validation("A workspace with this slug already exists".to_string())
            } else if msg.contains("WORKSPACE_NAME_EMPTY") {
                AppError::Validation("Workspace name cannot be empty".to_string())
            } else {
                AppError::Database(e)
            }
        })?;

    state
        .db
        .with_conn(|conn| read_workspace(conn, &id).map_err(|e| match e {
            AppError::Database(db) => db,
            _ => rusqlite::Error::InvalidQuery,
        }))
        .map_err(AppError::Database)
}

/// Soft-deletes a workspace and all its entities.
#[tauri::command]
pub fn delete_workspace(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM workspaces WHERE deleted_at IS NULL",
                [],
                |row| row.get(0),
            )?;
            if count <= 1 {
                return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                    std::io::Error::other("WORKSPACE_LAST_DELETE"),
                )));
            }

            conn.execute(
                "UPDATE workspaces SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, id],
            )?;

            // Cascade soft-delete to all owned entities
            conn.execute(
                "UPDATE notes SET deleted_at = ?1 WHERE workspace_id = ?2 AND deleted_at IS NULL",
                rusqlite::params![now, id],
            )?;
            conn.execute(
                "UPDATE tasks SET deleted_at = ?1 WHERE workspace_id = ?2 AND deleted_at IS NULL",
                rusqlite::params![now, id],
            )?;
            conn.execute(
                "UPDATE plans SET deleted_at = ?1 WHERE workspace_id = ?2 AND deleted_at IS NULL",
                rusqlite::params![now, id],
            )?;
            let _ = conn.execute(
                "UPDATE time_entries SET deleted_at = ?1 WHERE workspace_id = ?2 AND deleted_at IS NULL",
                rusqlite::params![now, id],
            );

            Ok(())
        })
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("WORKSPACE_LAST_DELETE") {
                AppError::Validation("Cannot delete the last remaining workspace".to_string())
            } else {
                AppError::Database(e)
            }
        })
}

/// Reorders workspaces by updating sort_order for all provided IDs.
#[tauri::command]
pub fn reorder_workspaces(
    state: State<'_, AppState>,
    input: ReorderWorkspacesInput,
) -> Result<(), AppError> {
    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            for (index, ws_id) in input.workspace_ids.iter().enumerate() {
                conn.execute(
                    "UPDATE workspaces SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![index as i32, now, ws_id],
                )?;
            }
            Ok(())
        })
        .map_err(AppError::Database)
}

/// Updates only the config JSON for a workspace.
#[tauri::command]
pub fn update_workspace_config(
    state: State<'_, AppState>,
    workspace_id: String,
    config: WorkspaceConfig,
) -> Result<WorkspaceConfig, AppError> {
    let now = now_iso();
    let config_json = serde_json::to_string(&config).map_err(AppError::Serialization)?;

    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "UPDATE workspaces SET config = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
                rusqlite::params![config_json, now, workspace_id],
            )?;
            Ok(())
        })
        .map_err(AppError::Database)?;

    Ok(config)
}

/// Gets workspace badge info for cross-workspace reference display.
#[tauri::command]
pub fn get_workspace_badge(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceBadge, AppError> {
    state
        .db
        .with_conn(|conn| {
            conn.query_row(
                "SELECT id, name, slug, icon, color FROM workspaces WHERE id = ?1",
                [&workspace_id],
                |row| {
                    Ok(WorkspaceBadge {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        slug: row.get(2)?,
                        icon: row.get(3)?,
                        color: row.get(4)?,
                    })
                },
            )
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "Workspace".to_string(),
                    id: workspace_id,
                }
            } else {
                AppError::Database(e)
            }
        })
}

/// Resolves a cross-workspace reference. Returns a badge if the entity
/// belongs to a different workspace than the active one.
#[tauri::command]
pub fn resolve_cross_workspace_ref(
    state: State<'_, AppState>,
    entity_id: String,
    entity_type: String,
    active_workspace_id: String,
) -> Result<Option<WorkspaceBadge>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let table = match entity_type.as_str() {
                "note" => "notes",
                "task" => "tasks",
                "plan" => "plans",
                _ => return Ok(None),
            };

            let ws_id: Option<String> = conn
                .query_row(
                    &format!("SELECT workspace_id FROM {} WHERE id = ?1", table),
                    [&entity_id],
                    |row| row.get(0),
                )
                .ok();

            if let Some(ref ws_id) = ws_id {
                if ws_id != &active_workspace_id {
                    let badge = conn.query_row(
                        "SELECT id, name, slug, icon, color FROM workspaces WHERE id = ?1",
                        [ws_id],
                        |row| {
                            Ok(WorkspaceBadge {
                                id: row.get(0)?,
                                name: row.get(1)?,
                                slug: row.get(2)?,
                                icon: row.get(3)?,
                                color: row.get(4)?,
                            })
                        },
                    )?;
                    return Ok(Some(badge));
                }
            }
            Ok(None)
        })
        .map_err(AppError::Database)
}

/// Moves an entity (note, task, or plan) to a different workspace.
#[tauri::command]
pub fn move_entity_to_workspace(
    state: State<'_, AppState>,
    entity_id: String,
    entity_type: String,
    target_workspace_id: String,
) -> Result<(), AppError> {
    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            let table = match entity_type.as_str() {
                "note" => "notes",
                "task" => "tasks",
                "plan" => "plans",
                "time_entry" => "time_entries",
                _ => {
                    return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                        std::io::Error::other("INVALID_ENTITY_TYPE"),
                    )));
                }
            };

            // Verify target workspace exists
            let ws_exists: bool = conn.query_row(
                "SELECT COUNT(*) > 0 FROM workspaces WHERE id = ?1 AND deleted_at IS NULL",
                [&target_workspace_id],
                |row| row.get(0),
            )?;
            if !ws_exists {
                return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                    std::io::Error::other("TARGET_WORKSPACE_NOT_FOUND"),
                )));
            }

            let affected = conn.execute(
                &format!(
                    "UPDATE {} SET workspace_id = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
                    table
                ),
                rusqlite::params![target_workspace_id, now, entity_id],
            )?;

            if affected == 0 {
                return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                    std::io::Error::other("ENTITY_NOT_FOUND"),
                )));
            }

            Ok(())
        })
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("INVALID_ENTITY_TYPE") {
                AppError::Validation("Invalid entity type. Must be note, task, plan, or time_entry".to_string())
            } else if msg.contains("TARGET_WORKSPACE_NOT_FOUND") {
                AppError::NotFound {
                    entity: "Workspace".to_string(),
                    id: target_workspace_id,
                }
            } else if msg.contains("ENTITY_NOT_FOUND") {
                AppError::NotFound {
                    entity: entity_type,
                    id: entity_id,
                }
            } else {
                AppError::Database(e)
            }
        })
}

/// Moves multiple entities of the same type to a different workspace in one operation.
#[tauri::command]
pub fn bulk_move_entities_to_workspace(
    state: State<'_, AppState>,
    entity_ids: Vec<String>,
    entity_type: String,
    target_workspace_id: String,
) -> Result<u32, AppError> {
    if entity_ids.is_empty() {
        return Ok(0);
    }

    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            let table = match entity_type.as_str() {
                "note" => "notes",
                "task" => "tasks",
                "plan" => "plans",
                "time_entry" => "time_entries",
                _ => {
                    return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                        std::io::Error::other("INVALID_ENTITY_TYPE"),
                    )));
                }
            };

            // Verify target workspace exists
            let ws_exists: bool = conn.query_row(
                "SELECT COUNT(*) > 0 FROM workspaces WHERE id = ?1 AND deleted_at IS NULL",
                [&target_workspace_id],
                |row| row.get(0),
            )?;
            if !ws_exists {
                return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                    std::io::Error::other("TARGET_WORKSPACE_NOT_FOUND"),
                )));
            }

            let sql = format!(
                "UPDATE {} SET workspace_id = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
                table
            );
            let mut total: u32 = 0;
            for id in &entity_ids {
                let affected = conn.execute(&sql, rusqlite::params![target_workspace_id, now, id])?;
                total += affected as u32;
            }

            Ok(total)
        })
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("INVALID_ENTITY_TYPE") {
                AppError::Validation("Invalid entity type. Must be note, task, plan, or time_entry".to_string())
            } else if msg.contains("TARGET_WORKSPACE_NOT_FOUND") {
                AppError::NotFound {
                    entity: "Workspace".to_string(),
                    id: target_workspace_id,
                }
            } else {
                AppError::Database(e)
            }
        })
}

/// Gets dashboard data for a workspace. Only computes data for requested widgets.
#[tauri::command]
pub fn get_dashboard_data(
    state: State<'_, AppState>,
    workspace_id: String,
    widgets: Vec<String>,
) -> Result<DashboardData, AppError> {
    let today = today_iso();

    state
        .db
        .with_conn(|conn| {
            let mut data = DashboardData {
                today_plan: Vec::new(),
                pending_tasks: Vec::new(),
                recent_notes: Vec::new(),
                time_today: TimeSummary { total_mins: 0, active_mins: 0, entry_count: 0 },
                sticky_tasks: Vec::new(),
                upcoming_deadlines: Vec::new(),
            };

            if widgets.iter().any(|w| w == "today_plan") {
                let mut stmt = conn.prepare(
                    "SELECT id, title, start_time, end_time, type, color
                     FROM plans
                     WHERE workspace_id = ?1 AND deleted_at IS NULL
                       AND date(start_time) <= ?2 AND date(end_time) >= ?2
                     ORDER BY start_time",
                )?;
                data.today_plan = stmt
                    .query_map(rusqlite::params![workspace_id, today], |row| {
                        Ok(DashboardPlan {
                            id: row.get(0)?,
                            title: row.get(1)?,
                            start_time: row.get(2)?,
                            end_time: row.get(3)?,
                            plan_type: row.get(4)?,
                            color: row.get(5)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
            }

            if widgets.iter().any(|w| w == "pending_tasks") {
                let mut stmt = conn.prepare(
                    "SELECT id, title, status, priority, due_date, color
                     FROM tasks
                     WHERE workspace_id = ?1 AND deleted_at IS NULL
                       AND status IN ('inbox', 'todo', 'in_progress')
                     ORDER BY
                       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
                       created_at DESC
                     LIMIT 20",
                )?;
                data.pending_tasks = stmt
                    .query_map(rusqlite::params![workspace_id], |row| {
                        Ok(DashboardTask {
                            id: row.get(0)?,
                            title: row.get(1)?,
                            status: row.get(2)?,
                            priority: row.get(3)?,
                            due_date: row.get(4)?,
                            color: row.get(5)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
            }

            if widgets.iter().any(|w| w == "recent_notes") {
                let mut stmt = conn.prepare(
                    "SELECT id, title, type, folder, updated_at
                     FROM notes
                     WHERE workspace_id = ?1 AND deleted_at IS NULL
                     ORDER BY updated_at DESC
                     LIMIT 10",
                )?;
                data.recent_notes = stmt
                    .query_map(rusqlite::params![workspace_id], |row| {
                        Ok(DashboardNote {
                            id: row.get(0)?,
                            title: row.get(1)?,
                            note_type: row.get(2)?,
                            folder: row.get(3)?,
                            updated_at: row.get(4)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
            }

            if widgets.iter().any(|w| w == "time_today") {
                data.time_today = conn.query_row(
                    "SELECT COALESCE(COUNT(*), 0),
                            COALESCE(SUM(active_mins), 0),
                            COALESCE(SUM(CASE WHEN end_time IS NOT NULL
                              THEN CAST((julianday(end_time) - julianday(start_time)) * 1440 AS INTEGER)
                              ELSE 0 END), 0)
                     FROM time_entries
                     WHERE workspace_id = ?1 AND date(start_time) = ?2",
                    rusqlite::params![workspace_id, today],
                    |row| {
                        Ok(TimeSummary {
                            entry_count: row.get(0)?,
                            active_mins: row.get(1)?,
                            total_mins: row.get(2)?,
                        })
                    },
                )?;
            }

            if widgets.iter().any(|w| w == "sticky_tasks") {
                let mut stmt = conn.prepare(
                    "SELECT id, title, status, priority, due_date, color
                     FROM tasks
                     WHERE workspace_id = ?1 AND deleted_at IS NULL
                       AND is_sticky = 1 AND status NOT IN ('done', 'cancelled')
                     ORDER BY created_at",
                )?;
                data.sticky_tasks = stmt
                    .query_map(rusqlite::params![workspace_id], |row| {
                        Ok(DashboardTask {
                            id: row.get(0)?,
                            title: row.get(1)?,
                            status: row.get(2)?,
                            priority: row.get(3)?,
                            due_date: row.get(4)?,
                            color: row.get(5)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
            }

            if widgets.iter().any(|w| w == "upcoming_deadlines") {
                let mut stmt = conn.prepare(
                    "SELECT id, title, status, priority, due_date, color
                     FROM tasks
                     WHERE workspace_id = ?1 AND deleted_at IS NULL
                       AND due_date IS NOT NULL
                       AND due_date >= ?2
                       AND due_date <= date(?2, '+7 days')
                       AND status NOT IN ('done', 'cancelled')
                     ORDER BY due_date",
                )?;
                data.upcoming_deadlines = stmt
                    .query_map(rusqlite::params![workspace_id, today], |row| {
                        Ok(DashboardTask {
                            id: row.get(0)?,
                            title: row.get(1)?,
                            status: row.get(2)?,
                            priority: row.get(3)?,
                            due_date: row.get(4)?,
                            color: row.get(5)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
            }

            Ok(data)
        })
        .map_err(AppError::Database)
}
