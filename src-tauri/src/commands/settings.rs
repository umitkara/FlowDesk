use crate::models::note_version::VersionHistoryConfig;
use crate::services::backup::BackupCommand;
use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::time::now_iso;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{Emitter, State};

/// Setting keys that affect the backup scheduler.
const BACKUP_KEYS: &[&str] = &[
    "backup_enabled",
    "backup_interval_hours",
    "backup_retention_days",
];

/// Reads current backup settings from DB and sends a Reconfigure command.
fn maybe_reconfigure_backup(state: &AppState) {
    let get = |key: &str, default: &str| -> String {
        state
            .db
            .with_conn(|conn| {
                conn.query_row(
                    "SELECT value FROM settings WHERE key = ?1",
                    [key],
                    |row| row.get(0),
                )
                .or(Ok(default.to_string()))
            })
            .unwrap_or_else(|_| default.to_string())
    };

    let enabled = get("backup_enabled", "true") == "true";
    let interval_hours: u64 = get("backup_interval_hours", "24").parse().unwrap_or(24);
    let retention_days: u64 = get("backup_retention_days", "30").parse().unwrap_or(30);

    if let Ok(tx) = state.backup_tx.lock() {
        let _ = tx.send(BackupCommand::Reconfigure {
            enabled,
            interval_hours,
            retention_days,
        });
    }
}

/// Dispatches side-effects when settings change.
fn on_settings_changed(state: &AppState, keys: &[&str]) {
    if keys.iter().any(|k| BACKUP_KEYS.contains(k)) {
        maybe_reconfigure_backup(state);
    }
}

/// Theme settings stored as JSON in the settings table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeSettings {
    pub mode: String,
    pub accent_color: String,
}

impl Default for ThemeSettings {
    fn default() -> Self {
        Self {
            mode: "system".to_string(),
            accent_color: "#3b82f6".to_string(),
        }
    }
}

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
        .map_err(AppError::Database)?;

    on_settings_changed(&state, &[&key]);
    Ok(())
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
        .map_err(AppError::Database)?;

    let keys: Vec<&str> = settings.keys().map(|k| k.as_str()).collect();
    on_settings_changed(&state, &keys);
    Ok(())
}

/// Gets the customized keyboard shortcuts.
#[tauri::command]
pub fn get_keyboard_shortcuts(
    state: State<'_, AppState>,
) -> Result<HashMap<String, String>, AppError> {
    let json_str = state
        .db
        .with_conn(|conn| {
            conn.query_row(
                "SELECT value FROM settings WHERE key = 'keyboard_shortcuts'",
                [],
                |row| row.get::<_, String>(0),
            )
        })
        .unwrap_or_else(|_| "{}".to_string());

    serde_json::from_str(&json_str).map_err(AppError::Serialization)
}

/// Updates keyboard shortcuts. Validates for conflicts.
#[tauri::command]
pub fn update_keyboard_shortcuts(
    state: State<'_, AppState>,
    shortcuts: HashMap<String, String>,
) -> Result<(), AppError> {
    // Check for duplicate bindings
    let mut seen_bindings: HashMap<String, String> = HashMap::new();
    for (action, binding) in &shortcuts {
        if let Some(existing_action) = seen_bindings.get(binding) {
            return Err(AppError::Validation(format!(
                "Shortcut '{}' is already bound to '{}'",
                binding, existing_action
            )));
        }
        seen_bindings.insert(binding.clone(), action.clone());
    }

    let json_str = serde_json::to_string(&shortcuts).map_err(AppError::Serialization)?;
    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('keyboard_shortcuts', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
                rusqlite::params![json_str, now],
            )?;
            Ok(())
        })
        .map_err(AppError::Database)
}

/// Gets the theme settings.
#[tauri::command]
pub fn get_theme(state: State<'_, AppState>) -> Result<ThemeSettings, AppError> {
    let json_str = state
        .db
        .with_conn(|conn| {
            conn.query_row(
                "SELECT value FROM settings WHERE key = 'theme_settings'",
                [],
                |row| row.get::<_, String>(0),
            )
        })
        .unwrap_or_else(|_| "{}".to_string());

    Ok(serde_json::from_str(&json_str).unwrap_or_default())
}

/// Updates the theme settings.
#[tauri::command]
pub fn update_theme(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    theme: ThemeSettings,
) -> Result<(), AppError> {
    let json_str = serde_json::to_string(&theme).map_err(AppError::Serialization)?;
    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            // Also update the legacy "theme" key for backwards compatibility
            conn.execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('theme', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
                rusqlite::params![&theme.mode, now],
            )?;
            conn.execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('theme_settings', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
                rusqlite::params![json_str, now],
            )?;
            Ok(())
        })
        .map_err(AppError::Database)?;

    // Emit event so frontend can react
    let _ = app_handle.emit("theme:changed", &theme);

    Ok(())
}

/// Gets the version history configuration.
#[tauri::command]
pub fn get_version_history_config(
    state: State<'_, AppState>,
) -> Result<VersionHistoryConfig, AppError> {
    let json_str = state
        .db
        .with_conn(|conn| {
            conn.query_row(
                "SELECT value FROM settings WHERE key = 'version_history'",
                [],
                |row| row.get::<_, String>(0),
            )
        })
        .unwrap_or_else(|_| "{}".to_string());

    Ok(serde_json::from_str(&json_str).unwrap_or_default())
}

/// Updates the version history configuration.
#[tauri::command]
pub fn update_version_history_config(
    state: State<'_, AppState>,
    config: VersionHistoryConfig,
) -> Result<(), AppError> {
    let json_str = serde_json::to_string(&config).map_err(AppError::Serialization)?;
    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('version_history', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
                rusqlite::params![json_str, now],
            )?;
            Ok(())
        })
        .map_err(AppError::Database)
}
