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

#[cfg(test)]
mod test_helpers;

use db::connection::DbPool;
use models::undo::OperationHistory;
use state::AppState;
use std::sync::{mpsc, Arc, Mutex};
use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconEvent;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;

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
            ("global_hotkey", "Ctrl+Shift+Space"),
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

/// Registers (or re-registers) the global hotkey with the OS.
///
/// Clears any stale registrations, then binds the given shortcut string.
/// On press, emits `quick-capture:activate` and focuses the main window.
pub(crate) fn register_global_hotkey(app_handle: &tauri::AppHandle, hotkey: &str) {
    let manager = app_handle.global_shortcut();
    let _ = manager.unregister_all();

    if hotkey.is_empty() {
        return;
    }

    let shortcut = match hotkey.parse::<tauri_plugin_global_shortcut::Shortcut>() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to parse global hotkey '{}': {}", hotkey, e);
            return;
        }
    };

    if let Err(e) = manager.on_shortcut(shortcut, move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let _ = app.emit("quick-capture:activate", ());
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }
    }) {
        eprintln!("Failed to register global hotkey '{}': {}", hotkey, e);
    }
}

/// Starts a background thread that checks for pending reminders every 30 seconds.
///
/// When a reminder is due, it fires a system notification and emits a
/// `reminder-fired` event to the frontend for in-app display.
fn start_reminder_scheduler(app_handle: tauri::AppHandle, db: Arc<DbPool>) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(30));

            // Check if reminders are enabled in settings
            let reminder_enabled = db
                .with_conn(|conn| {
                    let json_str: String = conn
                        .query_row(
                            "SELECT value FROM settings WHERE key = 'reminder_defaults'",
                            [],
                            |row| row.get(0),
                        )
                        .unwrap_or_else(|_| r#"{"enabled":true}"#.to_string());
                    Ok(json_str)
                })
                .unwrap_or_else(|_| r#"{"enabled":true}"#.to_string());

            let enabled = serde_json::from_str::<serde_json::Value>(&reminder_enabled)
                .ok()
                .and_then(|v| v.get("enabled")?.as_bool())
                .unwrap_or(true);

            if !enabled {
                continue;
            }

            let now = utils::time::now_iso();
            let result = db.with_conn(|conn| {
                let reminders = commands::reminders::get_pending_reminders(conn, &now)?;
                let mut fired = Vec::new();

                for reminder in &reminders {
                    let title = commands::reminders::get_entity_title(
                        conn,
                        &reminder.entity_type,
                        &reminder.entity_id,
                    );

                    fired.push((reminder.clone(), title));

                    commands::reminders::mark_fired(conn, &reminder.id)?;
                }

                Ok(fired)
            });

            if let Ok(fired_reminders) = result {
                for (reminder, title) in fired_reminders {
                    let payload = ReminderFiredPayload {
                        reminder,
                        title,
                    };
                    let _ = app_handle.emit("reminder-fired", &payload);
                }
            }
        }
    });
}

#[derive(serde::Serialize, Clone)]
struct ReminderFiredPayload {
    reminder: models::reminder::Reminder,
    title: String,
}

#[derive(serde::Serialize, Clone)]
struct BreakReminderPayload {
    title: String,
    body: String,
}

fn update_break_tracking(db: &DbPool, snooze_until: Option<f64>, break_ends_at: Option<f64>) {
    let _ = db.with_conn(|conn| {
        conn.execute(
            "UPDATE tracker_state SET snooze_until_secs = ?1, break_ends_at_secs = ?2 WHERE id = 1",
            rusqlite::params![snooze_until, break_ends_at],
        )?;
        Ok(())
    });
}

/// Starts a background thread that checks whether a break reminder should fire.
///
/// This is the single authority for all break timing. It handles snooze awareness,
/// break-over detection, and fires both OS notifications and frontend events.
fn start_break_reminder_scheduler(app_handle: tauri::AppHandle, db: Arc<DbPool>) {
    std::thread::spawn(move || {
        let mut last_break_fired_at_secs: f64 = -1.0;
        loop {
            std::thread::sleep(std::time::Duration::from_secs(10));

            let state = db.with_conn(|conn| {
                services::tracker::get_tracker_state(conn)
                    .map_err(|e| match e {
                        utils::errors::AppError::Database(db_err) => db_err,
                        other => rusqlite::Error::ToSqlConversionFailure(Box::new(
                            std::io::Error::other(other.to_string()),
                        )),
                    })
            });

            let Ok(state) = state else { continue };

            if state.status != models::time_entry::TrackerStatus::Running {
                last_break_fired_at_secs = -1.0;
                continue;
            }

            if state.break_mode == models::time_entry::BreakMode::None {
                continue;
            }

            let Some(ref started_at) = state.started_at else { continue };
            let elapsed_mins = services::tracker::calculate_elapsed_now(
                started_at,
                &state.pauses,
                state.paused_at.as_deref(),
            );
            let elapsed_secs = elapsed_mins * 60.0;

            // --- Break-over check ---
            if let Some(ends_at) = state.break_ends_at_secs {
                if elapsed_secs >= ends_at {
                    let payload = BreakReminderPayload {
                        title: "Break Over!".to_string(),
                        body: "Time to get back to work.".to_string(),
                    };
                    let _ = app_handle
                        .notification()
                        .builder()
                        .title(&payload.title)
                        .body(&payload.body)
                        .show();
                    let _ = app_handle.emit("break-over", payload);
                    update_break_tracking(&db, None, None);
                    continue;
                }
            }

            // --- Break fire check ---
            let interval_secs = match state.break_mode {
                models::time_entry::BreakMode::Pomodoro => {
                    (state.break_config.pomodoro.work_mins as f64) * 60.0
                }
                models::time_entry::BreakMode::Custom => {
                    (state.break_config.custom.interval_mins as f64) * 60.0
                }
                _ => continue,
            };

            if interval_secs <= 0.0 { continue; }

            let intervals_passed = (elapsed_secs / interval_secs).floor();
            let threshold = intervals_passed * interval_secs;

            if threshold > 0.0 && threshold > last_break_fired_at_secs {
                // --- Snooze check ---
                if let Some(snooze_until) = state.snooze_until_secs {
                    if elapsed_secs < snooze_until {
                        continue;
                    }
                }

                last_break_fired_at_secs = threshold;

                let (title, body, break_duration_secs) = match state.break_mode {
                    models::time_entry::BreakMode::Pomodoro => {
                        let cycles_before_long =
                            state.break_config.pomodoro.cycles_before_long.max(1);
                        let current_cycle = intervals_passed as u32;
                        let is_long = current_cycle.is_multiple_of(cycles_before_long);
                        let break_mins = if is_long {
                            state.break_config.pomodoro.long_break_mins
                        } else {
                            state.break_config.pomodoro.short_break_mins
                        };
                        let title = if is_long {
                            "Long Break Time!"
                        } else {
                            "Short Break Time!"
                        };
                        let body = format!(
                            "You've been working for {} minutes. Take a {}-minute break.",
                            state.break_config.pomodoro.work_mins, break_mins
                        );
                        (title.to_string(), body, (break_mins as f64) * 60.0)
                    }
                    models::time_entry::BreakMode::Custom => {
                        let break_mins = state.break_config.custom.interval_mins;
                        (
                            "Break Reminder".to_string(),
                            format!(
                                "You've been working for {} minutes. Time for a break!",
                                break_mins
                            ),
                            (break_mins as f64) * 60.0,
                        )
                    }
                    _ => continue,
                };

                let _ = app_handle
                    .notification()
                    .builder()
                    .title(&title)
                    .body(&body)
                    .show();

                let _ = app_handle.emit(
                    "break-reminder-fired",
                    BreakReminderPayload { title, body },
                );

                update_break_tracking(
                    &db,
                    None,
                    Some(elapsed_secs + break_duration_secs),
                );
            }
        }
    });
}

/// Configures and runs the Tauri application.
///
/// Sets up the database, runs migrations, seeds default data, starts the
/// backup scheduler, starts the reminder scheduler, and registers all IPC
/// command handlers.
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
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

            // Start backup scheduler with channel for live reconfiguration
            let settings = load_backup_settings(&db_pool);
            let (backup_tx, backup_rx) = mpsc::channel();
            services::backup::start_backup_scheduler(
                db_path.clone(),
                format!("{}/backups", data_dir),
                settings.backup_enabled,
                settings.interval_hours,
                settings.retention_days,
                backup_rx,
            );

            // Ensure built-in templates exist
            let _ = services::templates::ensure_defaults(&data_dir);

            let db_pool_arc = Arc::new(db_pool);

            app.manage(AppState {
                db: Arc::clone(&db_pool_arc),
                data_dir,
                operation_history: Arc::new(Mutex::new(OperationHistory::new(100))),
                backup_tx: Mutex::new(backup_tx),
            });

            // Register global hotkey
            let global_hotkey = db_pool_arc
                .with_conn(|conn| {
                    conn.query_row(
                        "SELECT value FROM settings WHERE key = 'global_hotkey'",
                        [],
                        |row| row.get::<_, String>(0),
                    )
                    .or(Ok("Ctrl+Shift+Space".to_string()))
                })
                .unwrap_or_else(|_| "Ctrl+Shift+Space".to_string());
            register_global_hotkey(app.handle(), &global_hotkey);

            // Start background reminder scheduler
            start_reminder_scheduler(app.handle().clone(), Arc::clone(&db_pool_arc));

            // Start background break reminder scheduler
            start_break_reminder_scheduler(app.handle().clone(), Arc::clone(&db_pool_arc));

            // --- System tray setup ---
            let show_item = MenuItemBuilder::with_id("show", "Show FlowDesk").build(app)?;
            let start_item = MenuItemBuilder::with_id("tray_start", "Start Tracking").build(app)?;
            let pause_item = MenuItemBuilder::with_id("tray_pause", "Pause").build(app)?;
            let resume_item = MenuItemBuilder::with_id("tray_resume", "Resume").build(app)?;
            let stop_item = MenuItemBuilder::with_id("tray_stop", "Stop Tracking").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&start_item)
                .item(&pause_item)
                .item(&resume_item)
                .item(&stop_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // Disable pause/resume/stop by default (tracker starts idle)
            let _ = pause_item.set_enabled(false);
            let _ = resume_item.set_enabled(false);
            let _ = stop_item.set_enabled(false);

            if let Some(tray) = app.tray_by_id("main-tray") {
                tray.set_menu(Some(menu))?;
                tray.set_tooltip(Some("FlowDesk"))?;

                tray.on_tray_icon_event(|tray_icon, event| {
                    if let TrayIconEvent::DoubleClick { .. } = event {
                        if let Some(window) = tray_icon.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                });

                tray.on_menu_event(|app_handle, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "tray_start" | "tray_pause" | "tray_resume" | "tray_stop" => {
                            // Emit events to the frontend which drives the state machine
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.emit("tray-tracker-action", event.id().as_ref());
                            }
                        }
                        "quit" => {
                            app_handle.exit(0);
                        }
                        _ => {}
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Check if the tracker is running — if so, minimize to tray instead of closing.
                let app = window.app_handle();
                let should_minimize = app.try_state::<AppState>().is_some_and(|state| {
                    state.db.with_conn(|conn| {
                        let status: String = conn
                            .query_row(
                                "SELECT status FROM tracker_state WHERE id = 1",
                                [],
                                |row| row.get(0),
                            )
                            .unwrap_or_else(|_| "idle".to_string());
                        Ok(status != "idle")
                    })
                    .unwrap_or(false)
                });

                if should_minimize {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
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
            commands::search::search_entities,
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
            commands::workspaces::create_workspace,
            commands::workspaces::update_workspace,
            commands::workspaces::delete_workspace,
            commands::workspaces::reorder_workspaces,
            commands::workspaces::update_workspace_config,
            commands::workspaces::get_workspace_badge,
            commands::workspaces::resolve_cross_workspace_ref,
            commands::workspaces::get_dashboard_data,
            commands::workspaces::move_entity_to_workspace,
            commands::workspaces::bulk_move_entities_to_workspace,
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
            // Plans
            commands::plans::create_plan,
            commands::plans::get_plan,
            commands::plans::update_plan,
            commands::plans::delete_plan,
            commands::plans::list_plans,
            commands::plans::get_daily_plan_summary,
            commands::plans::get_plan_with_links,
            commands::plans::spawn_task_from_plan,
            commands::plans::spawn_note_from_plan,
            commands::plans::link_task_to_plan,
            commands::plans::unlink_task_from_plan,
            commands::plans::search_plans,
            commands::plans::get_agenda,
            commands::plans::bulk_delete_plans,
            // References
            commands::references::create_reference,
            commands::references::delete_reference,
            commands::references::list_references,
            commands::references::get_backlinks,
            commands::references::sync_note_references,
            // Time Entries / Tracker
            commands::time_entries::tracker_start,
            commands::time_entries::tracker_pause,
            commands::time_entries::tracker_resume,
            commands::time_entries::tracker_stop,
            commands::time_entries::tracker_get_state,
            commands::time_entries::tracker_update_notes,
            commands::time_entries::tracker_add_session_note,
            commands::time_entries::tracker_edit_session_note,
            commands::time_entries::tracker_delete_session_note,
            commands::time_entries::tracker_save_detail,
            commands::time_entries::tracker_discard,
            commands::time_entries::tracker_set_break_mode,
            commands::time_entries::tracker_snooze_break,
            commands::time_entries::tracker_recover_session,
            commands::time_entries::get_time_entry,
            commands::time_entries::list_time_entries,
            commands::time_entries::update_time_entry,
            commands::time_entries::delete_time_entry,
            commands::time_entries::get_daily_summary,
            commands::time_entries::get_weekly_summary,
            commands::time_entries::get_entries_for_task,
            commands::time_entries::get_entries_for_plan,
            commands::time_entries::update_tray_status,
            // Activity Log
            commands::activity::list_activity,
            commands::activity::get_entity_activity,
            // Saved Filters
            commands::filters::create_saved_filter,
            commands::filters::get_saved_filter,
            commands::filters::update_saved_filter,
            commands::filters::delete_saved_filter,
            commands::filters::list_saved_filters,
            commands::filters::reorder_saved_filters,
            // Discovery (Graph, Groups, Search, Comparisons)
            commands::discovery::faceted_search,
            commands::discovery::get_graph_data,
            commands::discovery::get_grouped_view,
            commands::discovery::get_planned_vs_actual,
            commands::discovery::get_planned_vs_actual_range,
            commands::discovery::get_backlinks_with_context,
            // Recurrence
            commands::recurrence::create_recurrence_rule,
            commands::recurrence::get_recurrence_rule,
            commands::recurrence::get_recurrence_rule_for_entity,
            commands::recurrence::update_recurrence_rule,
            commands::recurrence::delete_recurrence_rule,
            commands::recurrence::skip_next_occurrence,
            commands::recurrence::postpone_next_occurrence,
            commands::recurrence::detach_occurrence,
            commands::recurrence::edit_future_occurrences,
            commands::recurrence::delete_future_occurrences,
            commands::recurrence::get_occurrences,
            commands::recurrence::generate_pending_occurrences,
            // Templates & Suggestions
            commands::templates::list_templates,
            commands::templates::load_template,
            commands::templates::create_template,
            commands::templates::update_template,
            commands::templates::delete_template,
            commands::templates::apply_template,
            commands::templates::create_note_from_template,
            commands::templates::ensure_default_templates,
            commands::templates::suggest_on_tracker_stop,
            // Reminders
            commands::reminders::get_reminder_defaults,
            commands::reminders::update_reminder_defaults,
            commands::reminders::create_reminder,
            commands::reminders::get_reminders_for_entity,
            commands::reminders::update_reminder,
            commands::reminders::delete_reminder,
            commands::reminders::dismiss_reminder,
            commands::reminders::sync_entity_reminders,
            // Version History
            commands::versions::create_version,
            commands::versions::list_versions,
            commands::versions::get_version,
            commands::versions::restore_version,
            commands::versions::delete_version,
            commands::versions::prune_versions,
            commands::versions::get_version_storage_stats,
            commands::versions::diff_versions,
            // Import
            commands::import::import_markdown_folder,
            commands::import::import_obsidian_vault,
            commands::import::import_csv_tasks,
            commands::import::preview_csv,
            // Enhanced Export
            commands::export::export_workspace_json,
            commands::export::export_tasks_csv,
            commands::export::export_notes_markdown,
            commands::export::export_single_note_markdown,
            // Undo/Redo
            commands::undo::undo_operation,
            commands::undo::redo_operation,
            commands::undo::get_undo_redo_state,
            // Extended Settings
            commands::settings::get_keyboard_shortcuts,
            commands::settings::update_keyboard_shortcuts,
            commands::settings::get_theme,
            commands::settings::update_theme,
            commands::settings::get_version_history_config,
            commands::settings::update_version_history_config,
            // Global Hotkey
            commands::hotkey::update_global_hotkey,
            // Demo
            commands::demo::seed_demo_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
