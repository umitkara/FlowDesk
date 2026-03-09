use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::time::now_iso;
use tauri::State;

/// Updates the global hotkey binding, validates the shortcut, and re-registers with the OS.
#[tauri::command]
pub fn update_global_hotkey(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    hotkey: String,
) -> Result<(), AppError> {
    // Validate non-empty hotkey before writing to DB
    if !hotkey.is_empty() {
        hotkey
            .parse::<tauri_plugin_global_shortcut::Shortcut>()
            .map_err(|e| AppError::Validation(format!("Invalid hotkey '{}': {}", hotkey, e)))?;
    }

    let now = now_iso();
    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('global_hotkey', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
                rusqlite::params![hotkey, now],
            )?;
            Ok(())
        })
        .map_err(AppError::Database)?;

    crate::register_global_hotkey(&app_handle, &hotkey);
    Ok(())
}
