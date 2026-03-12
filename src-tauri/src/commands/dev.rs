#[cfg(debug_assertions)]
use std::time::Duration;

#[cfg(debug_assertions)]
use serde::Serialize;

#[cfg(debug_assertions)]
use crate::models::reminder::Reminder;

#[cfg(debug_assertions)]
use crate::utils::errors::AppError;

#[cfg(debug_assertions)]
use tauri_plugin_notification::NotificationExt;

/// Mirrors `ReminderFiredPayload` from lib.rs (private there).
#[cfg(debug_assertions)]
#[derive(Serialize, Clone)]
struct DevReminderPayload {
    reminder: Reminder,
    title: String,
}

/// Fires a synthetic reminder event after an optional delay.
/// Only available in debug builds — stripped from release.
#[cfg(debug_assertions)]
#[tauri::command]
pub fn dev_fire_reminder(
    app_handle: tauri::AppHandle,
    title: String,
    delay_secs: u64,
) -> Result<(), AppError> {
    use tauri::Emitter;

    std::thread::spawn(move || {
        if delay_secs > 0 {
            std::thread::sleep(Duration::from_secs(delay_secs));
        }

        let now = chrono::Utc::now().to_rfc3339();
        let id = format!("dev-{}", uuid::Uuid::now_v7());
        let entity_id = format!("dev-entity-{}", uuid::Uuid::now_v7());

        let reminder = Reminder {
            id: id.clone(),
            workspace_id: "dev-tools".to_string(),
            entity_type: "task".to_string(),
            entity_id,
            remind_at: now.clone(),
            offset_type: "at_time".to_string(),
            offset_mins: None,
            is_fired: true,
            is_dismissed: false,
            created_at: now.clone(),
            updated_at: now,
        };

        let _ = app_handle
            .notification()
            .builder()
            .title(&title)
            .body("task reminder is due")
            .show();
        let payload = DevReminderPayload { reminder, title };
        let _ = app_handle.emit("reminder-fired", payload);
    });

    Ok(())
}
