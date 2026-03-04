use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::time::now_iso;
use std::collections::HashMap;
use tauri::State;

/// Gets a single setting value by key. Returns `None` if the key does not exist.
#[tauri::command]
pub fn get_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<String>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let result = conn.query_row(
                "SELECT value FROM settings WHERE key = ?1",
                [&key],
                |row| row.get::<_, Option<String>>(0),
            );
            match result {
                Ok(val) => Ok(val),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(e),
            }
        })
        .map_err(AppError::Database)
}

/// Sets a single setting value, creating or updating the key.
#[tauri::command]
pub fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), AppError> {
    let now = now_iso();
    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
                rusqlite::params![key, value, now],
            )?;
            Ok(())
        })
        .map_err(AppError::Database)
}

/// Returns all settings as a key-value map.
#[tauri::command]
pub fn get_all_settings(
    state: State<'_, AppState>,
) -> Result<HashMap<String, String>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
            let entries = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1).unwrap_or_default(),
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(entries.into_iter().collect())
        })
        .map_err(AppError::Database)
}

/// Sets multiple settings at once in a single transaction.
#[tauri::command]
pub fn set_many_settings(
    state: State<'_, AppState>,
    settings: HashMap<String, String>,
) -> Result<(), AppError> {
    let now = now_iso();
    state
        .db
        .with_conn(|conn| {
            let tx = conn.unchecked_transaction()?;
            for (key, value) in &settings {
                tx.execute(
                    "INSERT INTO settings (key, value, updated_at)
                     VALUES (?1, ?2, ?3)
                     ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
                    rusqlite::params![key, value, now],
                )?;
            }
            tx.commit()?;
            Ok(())
        })
        .map_err(AppError::Database)
}
