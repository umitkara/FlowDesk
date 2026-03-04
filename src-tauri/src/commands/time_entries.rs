use crate::models::time_entry::{
    BreakConfig, DailySummary, SaveDetailInput, SessionNote, StartTrackerInput, TimeEntry,
    TrackerState, WeeklySummary,
};
use crate::services::tracker;
use crate::state::AppState;
use crate::utils::errors::AppError;
use tauri::{AppHandle, State};

/// Converts an `AppError` into a `rusqlite::Error` for use inside `with_conn` closures.
fn to_db_err(e: AppError) -> rusqlite::Error {
    match e {
        AppError::Database(db_err) => db_err,
        other => rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
            other.to_string(),
        ))),
    }
}

// ---------------------------------------------------------------------------
// Tracker state machine commands
// ---------------------------------------------------------------------------

/// Starts a new tracking session.
///
/// Creates a time entry row and transitions the tracker from Idle to Running.
/// Returns an error if the tracker is already active.
#[tauri::command]
pub fn tracker_start(
    state: State<'_, AppState>,
    workspace_id: String,
    linked_plan_id: Option<String>,
    linked_task_id: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
    break_mode: Option<String>,
) -> Result<TrackerState, AppError> {
    let result = state.db.with_conn(|conn| {
        tracker::start(
            conn,
            StartTrackerInput {
                workspace_id,
                linked_plan_id,
                linked_task_id,
                category,
                tags,
                break_mode,
            },
        )
        .map_err(to_db_err)
    })?;
    Ok(result)
}

/// Pauses an active tracking session.
///
/// Records a new pause interval. Returns an error if the tracker is not running.
#[tauri::command]
pub fn tracker_pause(state: State<'_, AppState>) -> Result<TrackerState, AppError> {
    let result = state
        .db
        .with_conn(|conn| tracker::pause(conn).map_err(to_db_err))?;
    Ok(result)
}

/// Resumes a paused tracking session.
///
/// Closes the current pause interval. Returns an error if the tracker is not paused.
#[tauri::command]
pub fn tracker_resume(state: State<'_, AppState>) -> Result<TrackerState, AppError> {
    let result = state
        .db
        .with_conn(|conn| tracker::resume(conn).map_err(to_db_err))?;
    Ok(result)
}

/// Stops an active or paused tracking session.
///
/// Computes `active_mins` and stores `end_time`. Returns the final state
/// for the frontend detail form. Returns an error if the tracker is idle.
#[tauri::command]
pub fn tracker_stop(state: State<'_, AppState>) -> Result<TrackerState, AppError> {
    let result = state
        .db
        .with_conn(|conn| tracker::stop(conn).map_err(to_db_err))?;
    Ok(result)
}

/// Returns the current tracker state.
///
/// Used on app startup to restore a running/paused session after crash or restart.
#[tauri::command]
pub fn tracker_get_state(state: State<'_, AppState>) -> Result<TrackerState, AppError> {
    let result = state
        .db
        .with_conn(|conn| tracker::get_tracker_state(conn).map_err(to_db_err))?;
    Ok(result)
}

/// Updates the running notes on an active session.
///
/// Debounced on the frontend (500ms).
#[tauri::command]
pub fn tracker_update_notes(
    state: State<'_, AppState>,
    notes: String,
) -> Result<(), AppError> {
    state
        .db
        .with_conn(|conn| tracker::update_notes(conn, notes).map_err(to_db_err))?;
    Ok(())
}

/// Adds a timestamped session note to the active session.
///
/// Returns the new `SessionNote` with computed `elapsed_mins` and `wall_time`.
#[tauri::command]
pub fn tracker_add_session_note(
    state: State<'_, AppState>,
    text: String,
    ref_type: Option<String>,
    ref_id: Option<String>,
) -> Result<SessionNote, AppError> {
    let result = state.db.with_conn(|conn| {
        tracker::add_session_note(conn, text, ref_type, ref_id).map_err(to_db_err)
    })?;
    Ok(result)
}

// ---------------------------------------------------------------------------
// Detail form commands
// ---------------------------------------------------------------------------

/// Saves the detail form for a completed session.
///
/// Updates notes, category, tags, and entity links. Optionally spawns a new
/// task or note from the session. Resets the tracker to idle.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn tracker_save_detail(
    state: State<'_, AppState>,
    time_entry_id: String,
    notes: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
    linked_plan_id: Option<String>,
    linked_task_id: Option<String>,
    create_task: Option<crate::models::time_entry::CreateTaskFromSession>,
    create_note: Option<crate::models::time_entry::CreateNoteFromSession>,
) -> Result<TimeEntry, AppError> {
    let result = state.db.with_conn(|conn| {
        tracker::save_detail(
            conn,
            SaveDetailInput {
                time_entry_id,
                notes,
                category,
                tags,
                linked_plan_id,
                linked_task_id,
                create_task,
                create_note,
            },
        )
        .map_err(to_db_err)
    })?;
    Ok(result)
}

/// Discards (soft-deletes) a time entry and resets the tracker to idle.
#[tauri::command]
pub fn tracker_discard(
    state: State<'_, AppState>,
    time_entry_id: String,
) -> Result<(), AppError> {
    state
        .db
        .with_conn(|conn| tracker::discard(conn, &time_entry_id).map_err(to_db_err))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Break reminder commands
// ---------------------------------------------------------------------------

/// Updates the break reminder mode and configuration.
///
/// If the tracker is running, the frontend will restart its break scheduler
/// with the new settings.
#[tauri::command]
pub fn tracker_set_break_mode(
    state: State<'_, AppState>,
    mode: String,
    config: Option<BreakConfig>,
) -> Result<(), AppError> {
    state
        .db
        .with_conn(|conn| tracker::set_break_mode(conn, &mode, config).map_err(to_db_err))?;
    Ok(())
}

/// Delays the next break reminder by the configured snooze duration.
#[tauri::command]
pub fn tracker_snooze_break(state: State<'_, AppState>) -> Result<(), AppError> {
    state
        .db
        .with_conn(|conn| tracker::snooze_break(conn).map_err(to_db_err))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Recovery command
// ---------------------------------------------------------------------------

/// Recovers a tracking session that was interrupted by a crash or force-close.
///
/// * `action = "resume"` — treats the gap as a pause, continues the timer.
/// * `action = "stop"` — sets `end_time` to the last known update, shows the detail form.
#[tauri::command]
pub fn tracker_recover_session(
    state: State<'_, AppState>,
    action: String,
) -> Result<TrackerState, AppError> {
    let result = state
        .db
        .with_conn(|conn| tracker::recover_session(conn, &action).map_err(to_db_err))?;
    Ok(result)
}

// ---------------------------------------------------------------------------
// Time entry CRUD commands
// ---------------------------------------------------------------------------

/// Returns a single time entry by ID.
#[tauri::command]
pub fn get_time_entry(
    state: State<'_, AppState>,
    id: String,
) -> Result<TimeEntry, AppError> {
    let result = state
        .db
        .with_conn(|conn| tracker::read_time_entry(conn, &id).map_err(to_db_err))?;
    Ok(result)
}

/// Lists time entries matching the given filters.
///
/// Returns entries ordered by `start_time DESC`, excluding soft-deleted entries.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn list_time_entries(
    state: State<'_, AppState>,
    workspace_id: String,
    start_date: Option<String>,
    end_date: Option<String>,
    category: Option<String>,
    tag: Option<String>,
    linked_task_id: Option<String>,
    linked_plan_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<TimeEntry>, AppError> {
    let result = state.db.with_conn(|conn| {
        tracker::list_time_entries(
            conn,
            &workspace_id,
            start_date.as_deref(),
            end_date.as_deref(),
            category.as_deref(),
            tag.as_deref(),
            linked_task_id.as_deref(),
            linked_plan_id.as_deref(),
            limit,
            offset,
        )
        .map_err(to_db_err)
    })?;
    Ok(result)
}

/// Updates metadata on a saved (non-running) time entry.
#[tauri::command]
pub fn update_time_entry(
    state: State<'_, AppState>,
    id: String,
    notes: Option<String>,
    category: Option<Option<String>>,
    tags: Option<Vec<String>>,
    linked_plan_id: Option<Option<String>>,
    linked_task_id: Option<Option<String>>,
) -> Result<TimeEntry, AppError> {
    let result = state.db.with_conn(|conn| {
        tracker::update_time_entry(conn, &id, notes, category, tags, linked_plan_id, linked_task_id)
            .map_err(to_db_err)
    })?;
    Ok(result)
}

/// Soft-deletes a time entry.
#[tauri::command]
pub fn delete_time_entry(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    state
        .db
        .with_conn(|conn| tracker::delete_time_entry(conn, &id).map_err(to_db_err))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Report commands
// ---------------------------------------------------------------------------

/// Returns a daily time summary for a given date.
///
/// Aggregates all non-deleted time entries for the date with category/tag breakdown.
#[tauri::command]
pub fn get_daily_summary(
    state: State<'_, AppState>,
    workspace_id: String,
    date: String,
) -> Result<DailySummary, AppError> {
    let result = state.db.with_conn(|conn| {
        tracker::get_daily_summary(conn, &workspace_id, &date).map_err(to_db_err)
    })?;
    Ok(result)
}

/// Returns a weekly time summary starting from a given Monday date.
///
/// Includes per-day breakdown and aggregated category/tag totals.
#[tauri::command]
pub fn get_weekly_summary(
    state: State<'_, AppState>,
    workspace_id: String,
    week_start: String,
) -> Result<WeeklySummary, AppError> {
    let result = state.db.with_conn(|conn| {
        tracker::get_weekly_summary(conn, &workspace_id, &week_start).map_err(to_db_err)
    })?;
    Ok(result)
}

/// Returns all time entries linked to a specific task.
#[tauri::command]
pub fn get_entries_for_task(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<Vec<TimeEntry>, AppError> {
    let result = state
        .db
        .with_conn(|conn| tracker::get_entries_for_task(conn, &task_id).map_err(to_db_err))?;
    Ok(result)
}

/// Returns all time entries linked to a specific plan.
#[tauri::command]
pub fn get_entries_for_plan(
    state: State<'_, AppState>,
    plan_id: String,
) -> Result<Vec<TimeEntry>, AppError> {
    let result = state
        .db
        .with_conn(|conn| tracker::get_entries_for_plan(conn, &plan_id).map_err(to_db_err))?;
    Ok(result)
}

/// Updates the system tray tooltip text and enables/disables menu items
/// based on the current tracker status.
#[tauri::command]
pub fn update_tray_status(app: AppHandle, status: String, elapsed: String) -> Result<(), AppError> {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let tooltip = if status == "idle" {
            "FlowDesk".to_string()
        } else {
            format!("FlowDesk — {} ({})", elapsed, status)
        };
        let _ = tray.set_tooltip(Some(&tooltip));
    }
    Ok(())
}
