/// Tauri IPC command handlers.
pub mod commands;
/// Database connection and migration management.
pub mod db;
/// Data model structs for entities.
pub mod models;
/// Business logic services (backup, export, front matter).
pub mod services;
/// Application state shared across commands.
pub mod state;
/// Shared utility functions (errors, id generation, timestamps).
pub mod utils;

use db::connection::DbPool;
use state::AppState;
use std::sync::Arc;
use tauri::Manager;

/// Backup-related settings loaded from the database.
struct BackupSettings {
    backup_enabled: bool,
    interval_hours: u64,
    retention_days: u64,
}

/// Loads backup configuration from the settings table.
fn load_backup_settings(db: &DbPool) -> BackupSettings {
    let get_setting = |key: &str, default: &str| -> String {
        db.with_conn(|conn| {
            let result = conn.query_row(
                "SELECT value FROM settings WHERE key = ?1",
                [key],
                |row| row.get::<_, String>(0),
            );
            match result {
                Ok(v) => Ok(v),
                Err(_) => Ok(default.to_string()),
            }
        })
        .unwrap_or_else(|_| default.to_string())
    };

    BackupSettings {
        backup_enabled: get_setting("backup_enabled", "true") == "true",
        interval_hours: get_setting("backup_interval_hours", "24")
            .parse()
            .unwrap_or(24),
        retention_days: get_setting("backup_retention_days", "30")
            .parse()
            .unwrap_or(30),
    }
}

/// Ensures the default "Personal" workspace exists on first launch.
fn ensure_default_workspace(conn: &rusqlite::Connection) -> Result<(), rusqlite::Error> {
    let count: i64 =
        conn.query_row("SELECT COUNT(*) FROM workspaces", [], |row| row.get(0))?;

    if count == 0 {
        let id = utils::id::generate_id();
        let now = utils::time::now_iso();
        conn.execute(
            "INSERT INTO workspaces (id, name, slug, icon, color, sort_order, config, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                id,
                "Personal",
                "personal",
                "\u{1f4d3}",
                "#3b82f6",
                0,
                r#"{"categories":[],"note_types":["journal","meeting","technical","draft","reference"]}"#,
                now,
                now,
            ],
        )?;
    }

    Ok(())
}

/// Inserts default settings if the settings table is empty.
fn ensure_default_settings(conn: &rusqlite::Connection) -> Result<(), rusqlite::Error> {
    let count: i64 =
        conn.query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))?;

    if count == 0 {
        let now = utils::time::now_iso();
        let defaults = vec![
            ("theme", "\"system\""),
            ("backup_enabled", "true"),
            ("backup_retention_days", "30"),
            ("backup_interval_hours", "24"),
            ("editor_mode", "\"wysiwyg\""),
            ("font_size", "14"),
            ("auto_save_debounce_ms", "1000"),
            ("sidebar_width", "260"),
        ];

        for (key, value) in defaults {
            conn.execute(
                "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
                rusqlite::params![key, value, now],
            )?;
        }
    }

    Ok(())
}

/// Resolves the application data directory path.
///
/// Uses `dirs::data_dir()` (AppData on Windows, Application Support on macOS,
/// .local/share on Linux) with a "FlowDesk" subdirectory.
fn resolve_data_dir() -> String {
    if let Some(data_dir) = dirs::data_dir() {
        data_dir
            .join("FlowDesk")
            .to_string_lossy()
            .to_string()
    } else {
        // Fallback to home directory
        let home = dirs::home_dir()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|| ".".to_string());
        format!("{}/.flowdesk", home)
    }
}

/// Creates required subdirectories in the data directory.
fn ensure_directories(data_dir: &str) {
    let dirs_to_create = ["", "backups", "exports", "attachments", "templates"];
    for sub in &dirs_to_create {
        let path = if sub.is_empty() {
            std::path::PathBuf::from(data_dir)
        } else {
            std::path::Path::new(data_dir).join(sub)
        };
        let _ = std::fs::create_dir_all(path);
    }
}

/// Configures and runs the Tauri application.
///
/// Sets up the database, runs migrations, seeds default data, starts the
/// backup scheduler, and registers all IPC command handlers.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED
                        | tauri_plugin_window_state::StateFlags::FULLSCREEN,
                )
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = resolve_data_dir();
            ensure_directories(&data_dir);

            let db_path = format!("{}/flowdesk.db", data_dir);
            let db_pool =
                DbPool::new(&db_path).expect("Failed to open database");

            // Run migrations
            db_pool
                .with_conn(db::migrations::run_migrations)
                .expect("Failed to run migrations");

            // Ensure default workspace and settings exist
            db_pool
                .with_conn(|conn| {
                    ensure_default_workspace(conn)?;
                    ensure_default_settings(conn)?;
                    Ok(())
                })
                .expect("Failed to seed default data");

            // Start backup scheduler
            let settings = load_backup_settings(&db_pool);
            if settings.backup_enabled {
                services::backup::start_backup_scheduler(
                    db_path.clone(),
                    format!("{}/backups", data_dir),
                    settings.interval_hours,
                    settings.retention_days,
                );
            }

            app.manage(AppState {
                db: Arc::new(db_pool),
                data_dir,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Notes
            commands::notes::create_note,
            commands::notes::get_note,
            commands::notes::update_note,
            commands::notes::delete_note,
            commands::notes::restore_note,
            commands::notes::hard_delete_note,
            commands::notes::list_notes,
            commands::notes::get_folder_tree,
            commands::notes::get_daily_note,
            commands::notes::create_daily_note,
            commands::notes::get_dates_with_notes,
            commands::notes::move_note_to_folder,
            commands::notes::get_note_count,
            // Search
            commands::search::search_notes,
            // Export
            commands::export::export_notes,
            commands::export::export_single_note,
            // Settings
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_all_settings,
            commands::settings::set_many_settings,
            // Workspaces
            commands::workspaces::list_workspaces,
            commands::workspaces::get_workspace,
            // Tasks
            commands::tasks::create_task,
            commands::tasks::get_task,
            commands::tasks::list_tasks,
            commands::tasks::update_task,
            commands::tasks::delete_task,
            commands::tasks::restore_task,
            commands::tasks::toggle_task_status,
            commands::tasks::get_subtask_tree,
            commands::tasks::bulk_update_task_status,
            commands::tasks::bulk_add_task_tags,
            commands::tasks::bulk_delete_tasks,
            commands::tasks::get_sticky_tasks,
            commands::tasks::move_task_status,
            // References
            commands::references::create_reference,
            commands::references::delete_reference,
            commands::references::list_references,
            commands::references::get_backlinks,
            commands::references::sync_note_references,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
