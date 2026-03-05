use crate::models::reminder::{
    CreateReminderInput, Reminder, ReminderDefaults, UpdateReminderInput,
};
use crate::services::reminders;
use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::{id::generate_id, time::now_iso};
use tauri::State;

/// Reads a reminder from the database.
fn read_reminder(conn: &rusqlite::Connection, id: &str) -> Result<Reminder, AppError> {
    let reminder = conn.query_row(
        "SELECT id, workspace_id, entity_type, entity_id, remind_at,
                offset_type, offset_mins, is_fired, is_dismissed,
                created_at, updated_at
         FROM reminders WHERE id = ?1",
        [id],
        |row| {
            Ok(Reminder {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                entity_type: row.get(2)?,
                entity_id: row.get(3)?,
                remind_at: row.get(4)?,
                offset_type: row.get(5)?,
                offset_mins: row.get(6)?,
                is_fired: row.get(7)?,
                is_dismissed: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        },
    );

    match reminder {
        Ok(r) => Ok(r),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(AppError::NotFound {
            entity: "Reminder".to_string(),
            id: id.to_string(),
        }),
        Err(e) => Err(AppError::Database(e)),
    }
}

/// Gets global reminder default settings.
#[tauri::command]
pub fn get_reminder_defaults(state: State<'_, AppState>) -> Result<ReminderDefaults, AppError> {
    state
        .db
        .with_conn(|conn| {
            let json_str: String = conn
                .query_row(
                    "SELECT value FROM settings WHERE key = 'reminder_defaults'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or_else(|_| {
                    r#"{"task_due":["1hr_before"],"plan_start":["15min_before"],"enabled":true}"#
                        .to_string()
                });

            reminders::parse_defaults(&json_str)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(e))))
        })
        .map_err(AppError::Database)
}

/// Updates global reminder default settings.
#[tauri::command]
pub fn update_reminder_defaults(
    state: State<'_, AppState>,
    defaults: ReminderDefaults,
) -> Result<(), AppError> {
    let json_str =
        reminders::serialize_defaults(&defaults).map_err(AppError::Internal)?;
    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value, updated_at) VALUES ('reminder_defaults', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
                rusqlite::params![json_str, now],
            )?;
            Ok(())
        })
        .map_err(AppError::Database)
}

/// Creates a custom reminder.
#[tauri::command]
pub fn create_reminder(
    state: State<'_, AppState>,
    input: CreateReminderInput,
) -> Result<Reminder, AppError> {
    let id = generate_id();
    let now = now_iso();

    let remind_at =
        reminders::compute_remind_at(&input.reference_time, &input.offset_type, input.offset_mins)
            .map_err(AppError::Validation)?;

    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "INSERT INTO reminders (id, workspace_id, entity_type, entity_id,
                    remind_at, offset_type, offset_mins, is_fired, is_dismissed,
                    created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, ?8, ?8)",
                rusqlite::params![
                    id,
                    input.workspace_id,
                    input.entity_type,
                    input.entity_id,
                    remind_at,
                    input.offset_type,
                    input.offset_mins,
                    now,
                ],
            )?;

            read_reminder(conn, &id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })
        })
        .map_err(AppError::Database)
}

/// Gets all reminders for an entity.
#[tauri::command]
pub fn get_reminders_for_entity(
    state: State<'_, AppState>,
    entity_type: String,
    entity_id: String,
) -> Result<Vec<Reminder>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_id, entity_type, entity_id, remind_at,
                        offset_type, offset_mins, is_fired, is_dismissed,
                        created_at, updated_at
                 FROM reminders
                 WHERE entity_type = ?1 AND entity_id = ?2
                 ORDER BY remind_at ASC",
            )?;

            let rows = stmt.query_map(rusqlite::params![entity_type, entity_id], |row| {
                Ok(Reminder {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    entity_type: row.get(2)?,
                    entity_id: row.get(3)?,
                    remind_at: row.get(4)?,
                    offset_type: row.get(5)?,
                    offset_mins: row.get(6)?,
                    is_fired: row.get(7)?,
                    is_dismissed: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })?;

            rows.collect::<Result<Vec<_>, _>>()
        })
        .map_err(AppError::Database)
}

/// Updates a reminder.
#[tauri::command]
pub fn update_reminder(
    state: State<'_, AppState>,
    reminder_id: String,
    update: UpdateReminderInput,
) -> Result<Reminder, AppError> {
    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            let existing = read_reminder(conn, &reminder_id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })?;

            let offset_type = update
                .offset_type
                .as_deref()
                .unwrap_or(&existing.offset_type);
            let offset_mins = match update.offset_mins {
                Some(Some(m)) => Some(m),
                Some(None) => None,
                None => existing.offset_mins,
            };

            // Recompute remind_at if reference_time provided
            let remind_at = if let Some(ref ref_time) = update.reference_time {
                reminders::compute_remind_at(ref_time, offset_type, offset_mins)
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(
                        std::io::Error::other(e),
                    )))?
            } else {
                existing.remind_at.clone()
            };

            conn.execute(
                "UPDATE reminders SET offset_type = ?1, offset_mins = ?2,
                    remind_at = ?3, updated_at = ?4 WHERE id = ?5",
                rusqlite::params![offset_type, offset_mins, remind_at, now, reminder_id],
            )?;

            read_reminder(conn, &reminder_id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })
        })
        .map_err(AppError::Database)
}

/// Deletes a reminder.
#[tauri::command]
pub fn delete_reminder(
    state: State<'_, AppState>,
    reminder_id: String,
) -> Result<(), AppError> {
    state
        .db
        .with_conn(|conn| {
            conn.execute("DELETE FROM reminders WHERE id = ?1", [&reminder_id])?;
            Ok(())
        })
        .map_err(AppError::Database)
}

/// Dismisses a fired reminder.
#[tauri::command]
pub fn dismiss_reminder(
    state: State<'_, AppState>,
    reminder_id: String,
) -> Result<(), AppError> {
    let now = now_iso();
    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "UPDATE reminders SET is_dismissed = 1, updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, reminder_id],
            )?;
            Ok(())
        })
        .map_err(AppError::Database)
}

/// Gets pending (unfired, undismissed) reminders due before a given time.
///
/// Used by the background reminder scheduler.
pub fn get_pending_reminders(
    conn: &rusqlite::Connection,
    before: &str,
) -> Result<Vec<Reminder>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, entity_type, entity_id, remind_at,
                offset_type, offset_mins, is_fired, is_dismissed,
                created_at, updated_at
         FROM reminders
         WHERE is_fired = 0 AND is_dismissed = 0 AND remind_at <= ?1
         ORDER BY remind_at ASC",
    )?;

    let rows = stmt.query_map([before], |row| {
        Ok(Reminder {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            entity_type: row.get(2)?,
            entity_id: row.get(3)?,
            remind_at: row.get(4)?,
            offset_type: row.get(5)?,
            offset_mins: row.get(6)?,
            is_fired: row.get(7)?,
            is_dismissed: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>()
}

/// Marks a reminder as fired.
pub fn mark_fired(conn: &rusqlite::Connection, reminder_id: &str) -> Result<(), rusqlite::Error> {
    let now = now_iso();
    conn.execute(
        "UPDATE reminders SET is_fired = 1, updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, reminder_id],
    )?;
    Ok(())
}

/// Gets the entity title for a reminder notification.
pub fn get_entity_title(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_id: &str,
) -> String {
    match entity_type {
        "task" => conn
            .query_row("SELECT title FROM tasks WHERE id = ?1", [entity_id], |row| {
                row.get::<_, String>(0)
            })
            .unwrap_or_else(|_| "Unknown Task".to_string()),
        "plan" => conn
            .query_row(
                "SELECT title FROM plans WHERE id = ?1",
                [entity_id],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_else(|_| "Unknown Plan".to_string()),
        _ => "Unknown".to_string(),
    }
}

/// Deletes all unfired, undismissed reminders for a given entity.
/// Used when re-syncing reminders after a date change.
pub fn delete_unfired_reminders_for_entity(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_id: &str,
) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "DELETE FROM reminders WHERE entity_type = ?1 AND entity_id = ?2 AND is_fired = 0",
        rusqlite::params![entity_type, entity_id],
    )
}

/// Deletes all reminders for a given entity (used on entity deletion).
pub fn delete_all_reminders_for_entity(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_id: &str,
) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "DELETE FROM reminders WHERE entity_type = ?1 AND entity_id = ?2",
        rusqlite::params![entity_type, entity_id],
    )
}

/// Collects offset_types from existing unfired reminders for an entity.
/// Used to preserve custom overrides when re-syncing after a date change.
pub fn get_unfired_offsets(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_id: &str,
) -> Result<Vec<String>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT offset_type FROM reminders
         WHERE entity_type = ?1 AND entity_id = ?2 AND is_fired = 0
         ORDER BY offset_type",
    )?;
    let rows = stmt.query_map(rusqlite::params![entity_type, entity_id], |row| {
        row.get::<_, String>(0)
    })?;
    rows.collect::<Result<Vec<_>, _>>()
}

/// Re-creates reminders for an entity using the given offset types and new reference time.
pub fn recreate_reminders_with_offsets(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_id: &str,
    reference_time: &str,
    workspace_id: &str,
    offsets: &[String],
) -> Result<(), rusqlite::Error> {
    let now = crate::utils::time::now_iso();
    for offset_type in offsets {
        let remind_at = match reminders::compute_remind_at(reference_time, offset_type, None) {
            Ok(t) => t,
            Err(_) => continue,
        };
        let id = crate::utils::id::generate_id();
        conn.execute(
            "INSERT INTO reminders (id, workspace_id, entity_type, entity_id,
                remind_at, offset_type, offset_mins, is_fired, is_dismissed,
                created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 0, 0, ?7, ?7)",
            rusqlite::params![id, workspace_id, entity_type, entity_id, remind_at, offset_type, now],
        )?;
    }
    Ok(())
}

/// Creates default reminders for an entity based on global settings.
pub fn create_default_reminders(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_id: &str,
    reference_time: &str,
    workspace_id: &str,
) -> Result<Vec<String>, rusqlite::Error> {
    let json_str: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'reminder_defaults'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| {
            r#"{"task_due":["1hr_before"],"plan_start":["15min_before"],"enabled":true}"#
                .to_string()
        });

    let defaults: ReminderDefaults = match serde_json::from_str(&json_str) {
        Ok(d) => d,
        Err(_) => return Ok(Vec::new()),
    };

    if !defaults.enabled {
        return Ok(Vec::new());
    }

    let offsets = match entity_type {
        "task" => &defaults.task_due,
        "plan" => &defaults.plan_start,
        _ => return Ok(Vec::new()),
    };

    let mut created_ids = Vec::new();
    let now = crate::utils::time::now_iso();

    for offset_type in offsets {
        let remind_at = match reminders::compute_remind_at(reference_time, offset_type, None) {
            Ok(t) => t,
            Err(_) => continue,
        };

        let id = crate::utils::id::generate_id();
        conn.execute(
            "INSERT INTO reminders (id, workspace_id, entity_type, entity_id,
                remind_at, offset_type, offset_mins, is_fired, is_dismissed,
                created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 0, 0, ?7, ?7)",
            rusqlite::params![id, workspace_id, entity_type, entity_id, remind_at, offset_type, now],
        )?;

        created_ids.push(id);
    }

    Ok(created_ids)
}

/// Replaces all unfired reminders for an entity with the given offset types.
/// Used by the per-entity reminder override UI.
#[tauri::command]
pub fn sync_entity_reminders(
    state: State<'_, AppState>,
    entity_type: String,
    entity_id: String,
    reference_time: String,
    workspace_id: String,
    offsets: Vec<String>,
) -> Result<Vec<Reminder>, AppError> {
    state
        .db
        .with_conn(|conn| {
            delete_unfired_reminders_for_entity(conn, &entity_type, &entity_id)?;
            recreate_reminders_with_offsets(
                conn,
                &entity_type,
                &entity_id,
                &reference_time,
                &workspace_id,
                &offsets,
            )?;

            // Return all current reminders for the entity
            let mut stmt = conn.prepare(
                "SELECT id, workspace_id, entity_type, entity_id, remind_at,
                        offset_type, offset_mins, is_fired, is_dismissed,
                        created_at, updated_at
                 FROM reminders
                 WHERE entity_type = ?1 AND entity_id = ?2
                 ORDER BY remind_at ASC",
            )?;
            let rows = stmt.query_map(rusqlite::params![entity_type, entity_id], |row| {
                Ok(Reminder {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    entity_type: row.get(2)?,
                    entity_id: row.get(3)?,
                    remind_at: row.get(4)?,
                    offset_type: row.get(5)?,
                    offset_mins: row.get(6)?,
                    is_fired: row.get(7)?,
                    is_dismissed: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()
        })
        .map_err(AppError::Database)
}
