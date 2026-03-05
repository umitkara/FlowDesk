use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::time::now_iso;
use tauri::State;

/// Updates the global hotkey binding.
#[tauri::command]
pub fn update_global_hotkey(
    state: State<'_, AppState>,
    hotkey: String,
) -> Result<(), AppError> {
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
        .map_err(AppError::Database)
}
