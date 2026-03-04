use crate::models::time_entry::{
    BreakConfig, BreakMode, CategoryTime, CreateNoteFromSession, CreateTaskFromSession,
    DailySummary, Pause, SaveDetailInput, SessionNote, StartTrackerInput, TagTime, TimeEntry,
    TrackerState, TrackerStatus, WeeklySummary,
};
use crate::utils::errors::AppError;
use crate::utils::{id::generate_id, time::now_iso};
use chrono::{DateTime, NaiveDate, Utc};
use rusqlite::Connection;

// ---------------------------------------------------------------------------
// Helper: read tracker state from the single-row tracker_state table
// ---------------------------------------------------------------------------

/// Reads the persisted tracker state from the database.
pub fn get_tracker_state(conn: &Connection) -> Result<TrackerState, AppError> {
    let row = conn.query_row(
        "SELECT status, time_entry_id, started_at, paused_at, pauses,
                notes, session_notes, linked_plan_id, linked_task_id,
                category, tags, break_mode, break_config, pomodoro_cycle, updated_at
         FROM tracker_state WHERE id = 1",
        [],
        |row| {
            let status_str: String = row.get(0)?;
            let pauses_json: String = row.get(4)?;
            let session_notes_json: String = row.get(6)?;
            let tags_json: String = row.get(10)?;
            let break_mode_str: String = row.get(11)?;
            let break_config_json: String = row.get(12)?;

            Ok((
                status_str,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                pauses_json,
                row.get::<_, String>(5)?,
                session_notes_json,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                tags_json,
                break_mode_str,
                break_config_json,
                row.get::<_, u32>(13)?,
                row.get::<_, String>(14)?,
            ))
        },
    )?;

    let status = match row.0.as_str() {
        "running" => TrackerStatus::Running,
        "paused" => TrackerStatus::Paused,
        _ => TrackerStatus::Idle,
    };

    let pauses: Vec<Pause> = serde_json::from_str(&row.4).unwrap_or_default();
    let session_notes: Vec<SessionNote> = serde_json::from_str(&row.6).unwrap_or_default();
    let tags: Vec<String> = serde_json::from_str(&row.10).unwrap_or_default();

    let break_mode = match row.11.as_str() {
        "pomodoro" => BreakMode::Pomodoro,
        "custom" => BreakMode::Custom,
        _ => BreakMode::None,
    };

    let break_config: BreakConfig =
        serde_json::from_str(&row.12).unwrap_or_default();

    Ok(TrackerState {
        status,
        time_entry_id: row.1,
        started_at: row.2,
        paused_at: row.3,
        pauses,
        notes: row.5,
        session_notes,
        linked_plan_id: row.7,
        linked_task_id: row.8,
        category: row.9,
        tags,
        break_mode,
        break_config,
        pomodoro_cycle: row.13,
        active_mins: None,
        end_time: None,
        updated_at: row.14,
    })
}

// ---------------------------------------------------------------------------
// Helper: persist tracker state
// ---------------------------------------------------------------------------

/// Writes the current tracker state to the database for crash recovery.
fn persist_state(conn: &Connection, state: &TrackerState) -> Result<(), AppError> {
    let status_str = match state.status {
        TrackerStatus::Idle => "idle",
        TrackerStatus::Running => "running",
        TrackerStatus::Paused => "paused",
    };

    let pauses_json = serde_json::to_string(&state.pauses)?;
    let session_notes_json = serde_json::to_string(&state.session_notes)?;
    let tags_json = serde_json::to_string(&state.tags)?;

    let break_mode_str = match state.break_mode {
        BreakMode::None => "none",
        BreakMode::Pomodoro => "pomodoro",
        BreakMode::Custom => "custom",
    };

    let break_config_json = serde_json::to_string(&state.break_config)?;
    let now = now_iso();

    conn.execute(
        "UPDATE tracker_state SET
            status = ?1, time_entry_id = ?2, started_at = ?3, paused_at = ?4,
            pauses = ?5, notes = ?6, session_notes = ?7, linked_plan_id = ?8,
            linked_task_id = ?9, category = ?10, tags = ?11, break_mode = ?12,
            break_config = ?13, pomodoro_cycle = ?14, updated_at = ?15
         WHERE id = 1",
        rusqlite::params![
            status_str,
            state.time_entry_id,
            state.started_at,
            state.paused_at,
            pauses_json,
            state.notes,
            session_notes_json,
            state.linked_plan_id,
            state.linked_task_id,
            state.category,
            tags_json,
            break_mode_str,
            break_config_json,
            state.pomodoro_cycle,
            now,
        ],
    )?;

    Ok(())
}

/// Resets tracker state to idle defaults.
fn reset_state(conn: &Connection) -> Result<(), AppError> {
    let now = now_iso();
    let default_config = serde_json::to_string(&BreakConfig::default())?;
    conn.execute(
        "UPDATE tracker_state SET
            status = 'idle', time_entry_id = NULL, started_at = NULL, paused_at = NULL,
            pauses = '[]', notes = '', session_notes = '[]', linked_plan_id = NULL,
            linked_task_id = NULL, category = NULL, tags = '[]', break_mode = 'none',
            break_config = ?1, pomodoro_cycle = 0, updated_at = ?2
         WHERE id = 1",
        rusqlite::params![default_config, now],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Helper: read a time entry
// ---------------------------------------------------------------------------

/// Reads a single time entry from the database.
pub fn read_time_entry(conn: &Connection, id: &str) -> Result<TimeEntry, AppError> {
    let entry = conn.query_row(
        "SELECT id, workspace_id, start_time, end_time, pauses, active_mins,
                notes, category, tags, session_notes, linked_plan_id,
                linked_task_id, created_at, updated_at, deleted_at
         FROM time_entries WHERE id = ?1",
        [id],
        |row| {
            let pauses_json: String = row.get(4)?;
            let tags_json: String = row.get(8)?;
            let session_notes_json: String = row.get(9)?;

            Ok(TimeEntry {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                start_time: row.get(2)?,
                end_time: row.get(3)?,
                pauses: serde_json::from_str(&pauses_json).unwrap_or_default(),
                active_mins: row.get(5)?,
                notes: row.get(6)?,
                category: row.get(7)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                session_notes: serde_json::from_str(&session_notes_json).unwrap_or_default(),
                linked_plan_id: row.get(10)?,
                linked_task_id: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
                deleted_at: row.get(14)?,
            })
        },
    );

    match entry {
        Ok(e) => Ok(e),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(AppError::NotFound {
            entity: "TimeEntry".to_string(),
            id: id.to_string(),
        }),
        Err(e) => Err(AppError::Database(e)),
    }
}

// ---------------------------------------------------------------------------
// Elapsed time calculation
// ---------------------------------------------------------------------------

/// Computes active minutes between two timestamps, excluding all pause intervals.
///
/// Used when stopping a session to calculate the final `active_mins` value.
pub fn calculate_active_mins(
    started_at: &str,
    end_time: &str,
    pauses: &[Pause],
) -> i64 {
    let start = match DateTime::parse_from_rfc3339(started_at) {
        Ok(dt) => dt.with_timezone(&Utc),
        Err(_) => return 0,
    };
    let end = match DateTime::parse_from_rfc3339(end_time) {
        Ok(dt) => dt.with_timezone(&Utc),
        Err(_) => return 0,
    };

    let total_secs = (end - start).num_seconds().max(0);
    let pause_secs: i64 = pauses
        .iter()
        .map(|p| {
            let p_start = DateTime::parse_from_rfc3339(&p.paused_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or(start);
            let p_end = p
                .resumed_at
                .as_deref()
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or(end);
            (p_end - p_start).num_seconds().max(0)
        })
        .sum();

    let active_secs = (total_secs - pause_secs).max(0);
    // Round to nearest minute
    (active_secs as f64 / 60.0).round() as i64
}

/// Computes the current active elapsed time in fractional minutes.
///
/// Used for live display while the tracker is running or paused.
pub fn calculate_elapsed_now(
    started_at: &str,
    pauses: &[Pause],
    paused_at: Option<&str>,
) -> f64 {
    let start = match DateTime::parse_from_rfc3339(started_at) {
        Ok(dt) => dt.with_timezone(&Utc),
        Err(_) => return 0.0,
    };

    let effective_end = if let Some(pa) = paused_at {
        DateTime::parse_from_rfc3339(pa)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now())
    } else {
        Utc::now()
    };

    let total_secs = (effective_end - start).num_seconds().max(0);
    let pause_secs: i64 = pauses
        .iter()
        .map(|p| {
            let p_start = DateTime::parse_from_rfc3339(&p.paused_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or(start);
            let p_end = p
                .resumed_at
                .as_deref()
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or(effective_end);
            (p_end - p_start).num_seconds().max(0)
        })
        .sum();

    let active_secs = (total_secs - pause_secs).max(0);
    active_secs as f64 / 60.0
}

// ---------------------------------------------------------------------------
// State machine transitions
// ---------------------------------------------------------------------------

/// Starts a new tracking session. Requires the tracker to be idle.
pub fn start(conn: &Connection, input: StartTrackerInput) -> Result<TrackerState, AppError> {
    let current = get_tracker_state(conn)?;
    if current.status != TrackerStatus::Idle {
        return Err(AppError::Validation(
            "Tracker is already running. Stop the current session first.".to_string(),
        ));
    }

    // Resolve workspace_id
    let workspace_id = if input.workspace_id.is_empty() {
        conn.query_row("SELECT id FROM workspaces LIMIT 1", [], |row| row.get(0))
            .unwrap_or_default()
    } else {
        input.workspace_id
    };

    let entry_id = generate_id();
    let now = now_iso();
    let tags = input.tags.unwrap_or_default();
    let tags_json = serde_json::to_string(&tags)?;

    // Create the time entry row
    conn.execute(
        "INSERT INTO time_entries (id, workspace_id, start_time, pauses, notes, category,
            tags, session_notes, linked_plan_id, linked_task_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, '[]', '', ?4, ?5, '[]', ?6, ?7, ?8, ?9)",
        rusqlite::params![
            entry_id,
            workspace_id,
            now,
            input.category,
            tags_json,
            input.linked_plan_id,
            input.linked_task_id,
            now,
            now,
        ],
    )?;

    // Create references if linked
    if let Some(ref plan_id) = input.linked_plan_id {
        create_time_logged_ref(conn, &entry_id, "plan", plan_id)?;
    }
    if let Some(ref task_id) = input.linked_task_id {
        create_time_logged_ref(conn, &entry_id, "task", task_id)?;
    }

    let break_mode = match input.break_mode.as_deref() {
        Some("pomodoro") => BreakMode::Pomodoro,
        Some("custom") => BreakMode::Custom,
        _ => BreakMode::None,
    };

    let state = TrackerState {
        status: TrackerStatus::Running,
        time_entry_id: Some(entry_id),
        started_at: Some(now.clone()),
        paused_at: None,
        pauses: Vec::new(),
        notes: String::new(),
        session_notes: Vec::new(),
        linked_plan_id: input.linked_plan_id,
        linked_task_id: input.linked_task_id,
        category: input.category,
        tags,
        break_mode,
        break_config: BreakConfig::default(),
        pomodoro_cycle: 0,
        active_mins: None,
        end_time: None,
        updated_at: now,
    };

    persist_state(conn, &state)?;
    Ok(state)
}

/// Pauses an active tracking session.
pub fn pause(conn: &Connection) -> Result<TrackerState, AppError> {
    let mut state = get_tracker_state(conn)?;
    if state.status != TrackerStatus::Running {
        return Err(AppError::Validation(
            "Tracker is not running. Cannot pause.".to_string(),
        ));
    }

    let now = now_iso();
    state.pauses.push(Pause {
        paused_at: now.clone(),
        resumed_at: None,
    });
    state.paused_at = Some(now.clone());
    state.status = TrackerStatus::Paused;
    state.updated_at = now;

    // Also update the time entry pauses
    if let Some(ref eid) = state.time_entry_id {
        let pauses_json = serde_json::to_string(&state.pauses)?;
        conn.execute(
            "UPDATE time_entries SET pauses = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![pauses_json, state.updated_at, eid],
        )?;
    }

    persist_state(conn, &state)?;
    Ok(state)
}

/// Resumes a paused tracking session.
pub fn resume(conn: &Connection) -> Result<TrackerState, AppError> {
    let mut state = get_tracker_state(conn)?;
    if state.status != TrackerStatus::Paused {
        return Err(AppError::Validation(
            "Tracker is not paused. Cannot resume.".to_string(),
        ));
    }

    let now = now_iso();
    if let Some(last) = state.pauses.last_mut() {
        last.resumed_at = Some(now.clone());
    }
    state.paused_at = None;
    state.status = TrackerStatus::Running;
    state.updated_at = now;

    // Also update the time entry pauses
    if let Some(ref eid) = state.time_entry_id {
        let pauses_json = serde_json::to_string(&state.pauses)?;
        conn.execute(
            "UPDATE time_entries SET pauses = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![pauses_json, state.updated_at, eid],
        )?;
    }

    persist_state(conn, &state)?;
    Ok(state)
}

/// Stops an active or paused tracking session.
///
/// Returns the final tracker state with computed `active_mins` and `end_time`
/// so the frontend can display the detail form.
pub fn stop(conn: &Connection) -> Result<TrackerState, AppError> {
    let mut state = get_tracker_state(conn)?;
    if state.status == TrackerStatus::Idle {
        return Err(AppError::Validation(
            "Tracker is not active. Nothing to stop.".to_string(),
        ));
    }

    let now = now_iso();

    // If paused, close the open pause
    if state.status == TrackerStatus::Paused {
        if let Some(last) = state.pauses.last_mut() {
            if last.resumed_at.is_none() {
                last.resumed_at = Some(now.clone());
            }
        }
    }

    let started_at = state.started_at.as_deref().unwrap_or(&now);
    let active = calculate_active_mins(started_at, &now, &state.pauses);

    // Update the time entry with final values
    if let Some(ref eid) = state.time_entry_id {
        let pauses_json = serde_json::to_string(&state.pauses)?;
        let session_notes_json = serde_json::to_string(&state.session_notes)?;
        conn.execute(
            "UPDATE time_entries SET end_time = ?1, active_mins = ?2, pauses = ?3,
                notes = ?4, session_notes = ?5, updated_at = ?6
             WHERE id = ?7",
            rusqlite::params![
                now,
                active,
                pauses_json,
                state.notes,
                session_notes_json,
                now,
                eid,
            ],
        )?;
    }

    state.status = TrackerStatus::Idle;
    state.active_mins = Some(active);
    state.end_time = Some(now.clone());
    state.updated_at = now;

    persist_state(conn, &state)?;
    Ok(state)
}

/// Saves the detail form for a completed session.
///
/// Updates the time entry with the user's final choices: notes, category, tags,
/// entity links, and optionally spawns a new task or note from the session.
pub fn save_detail(conn: &Connection, input: SaveDetailInput) -> Result<TimeEntry, AppError> {
    let entry = read_time_entry(conn, &input.time_entry_id)?;
    let now = now_iso();

    // Build update fields
    let notes = input.notes.unwrap_or(entry.notes.clone());
    let category = input.category.or(entry.category.clone());
    let tags = input.tags.unwrap_or(entry.tags.clone());
    let tags_json = serde_json::to_string(&tags)?;
    let linked_plan_id = input.linked_plan_id.or(entry.linked_plan_id.clone());
    let linked_task_id = input.linked_task_id.or(entry.linked_task_id.clone());

    conn.execute(
        "UPDATE time_entries SET notes = ?1, category = ?2, tags = ?3,
            linked_plan_id = ?4, linked_task_id = ?5, updated_at = ?6
         WHERE id = ?7",
        rusqlite::params![
            notes,
            category,
            tags_json,
            linked_plan_id,
            linked_task_id,
            now,
            input.time_entry_id,
        ],
    )?;

    // Update linked task's actual_mins
    if let Some(ref task_id) = linked_task_id {
        if let Some(active) = entry.active_mins {
            // Only add if this link is new (entry didn't already have this task linked)
            if entry.linked_task_id.as_ref() != Some(task_id) {
                conn.execute(
                    "UPDATE tasks SET actual_mins = actual_mins + ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![active, now, task_id],
                )?;
                create_time_logged_ref(conn, &input.time_entry_id, "task", task_id)?;
            }
        }
    }

    // Create plan reference if new
    if let Some(ref plan_id) = linked_plan_id {
        if entry.linked_plan_id.as_ref() != Some(plan_id) {
            create_time_logged_ref(conn, &input.time_entry_id, "plan", plan_id)?;
        }
    }

    // Spawn task from session
    if let Some(create_task) = input.create_task {
        spawn_task_from_session(conn, &entry, &create_task)?;
    }

    // Spawn note from session
    if let Some(create_note) = input.create_note {
        spawn_note_from_session(conn, &entry, &create_note)?;
    }

    // Reset tracker state to idle
    reset_state(conn)?;

    read_time_entry(conn, &input.time_entry_id)
}

/// Discards (soft-deletes) a time entry and resets the tracker to idle.
pub fn discard(conn: &Connection, time_entry_id: &str) -> Result<(), AppError> {
    let now = now_iso();
    conn.execute(
        "UPDATE time_entries SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![now, now, time_entry_id],
    )?;
    reset_state(conn)?;
    Ok(())
}

/// Adds a timestamped session note to an active tracking session.
pub fn add_session_note(
    conn: &Connection,
    text: String,
    ref_type: Option<String>,
    ref_id: Option<String>,
) -> Result<SessionNote, AppError> {
    let mut state = get_tracker_state(conn)?;
    if state.status == TrackerStatus::Idle {
        return Err(AppError::Validation(
            "Tracker is not active. Cannot add session note.".to_string(),
        ));
    }

    let started_at = state.started_at.as_deref().unwrap_or("");
    let elapsed = calculate_elapsed_now(started_at, &state.pauses, state.paused_at.as_deref());

    let note = SessionNote {
        elapsed_mins: (elapsed * 100.0).round() / 100.0,
        wall_time: now_iso(),
        text,
        ref_type,
        ref_id,
    };

    state.session_notes.push(note.clone());
    state.updated_at = now_iso();

    // Update both tracker state and time entry
    if let Some(ref eid) = state.time_entry_id {
        let sn_json = serde_json::to_string(&state.session_notes)?;
        conn.execute(
            "UPDATE time_entries SET session_notes = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![sn_json, state.updated_at, eid],
        )?;
    }

    persist_state(conn, &state)?;
    Ok(note)
}

/// Updates the running notes on an active session.
pub fn update_notes(conn: &Connection, notes: String) -> Result<(), AppError> {
    let mut state = get_tracker_state(conn)?;
    if state.status == TrackerStatus::Idle {
        return Err(AppError::Validation(
            "Tracker is not active. Cannot update notes.".to_string(),
        ));
    }

    let now = now_iso();
    state.notes = notes.clone();
    state.updated_at = now.clone();

    if let Some(ref eid) = state.time_entry_id {
        conn.execute(
            "UPDATE time_entries SET notes = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![notes, now, eid],
        )?;
    }

    persist_state(conn, &state)?;
    Ok(())
}

/// Recovers a tracking session that was interrupted by a crash or force-close.
///
/// * `"resume"` — treats the gap between last update and now as a pause, then
///   continues the timer.
/// * `"stop"` — sets `end_time` to the last known `updated_at` and computes
///   `active_mins`, returning the state for the detail form.
pub fn recover_session(conn: &Connection, action: &str) -> Result<TrackerState, AppError> {
    let mut state = get_tracker_state(conn)?;
    if state.status == TrackerStatus::Idle {
        return Err(AppError::Validation(
            "No interrupted session to recover.".to_string(),
        ));
    }

    let now = now_iso();

    match action {
        "resume" => {
            let gap_start = state.updated_at.clone();
            // Add a pause for the gap period
            state.pauses.push(Pause {
                paused_at: gap_start,
                resumed_at: Some(now.clone()),
            });
            state.paused_at = None;
            state.status = TrackerStatus::Running;
            state.updated_at = now;

            // Update time entry pauses
            if let Some(ref eid) = state.time_entry_id {
                let pauses_json = serde_json::to_string(&state.pauses)?;
                conn.execute(
                    "UPDATE time_entries SET pauses = ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![pauses_json, state.updated_at, eid],
                )?;
            }

            persist_state(conn, &state)?;
            Ok(state)
        }
        "stop" => {
            let end_time = state.updated_at.clone();

            // Close any open pause
            if let Some(last) = state.pauses.last_mut() {
                if last.resumed_at.is_none() {
                    last.resumed_at = Some(end_time.clone());
                }
            }

            let started_at = state.started_at.as_deref().unwrap_or(&end_time);
            let active = calculate_active_mins(started_at, &end_time, &state.pauses);

            if let Some(ref eid) = state.time_entry_id {
                let pauses_json = serde_json::to_string(&state.pauses)?;
                let sn_json = serde_json::to_string(&state.session_notes)?;
                conn.execute(
                    "UPDATE time_entries SET end_time = ?1, active_mins = ?2, pauses = ?3,
                        notes = ?4, session_notes = ?5, updated_at = ?6
                     WHERE id = ?7",
                    rusqlite::params![end_time, active, pauses_json, state.notes, sn_json, now, eid],
                )?;
            }

            state.status = TrackerStatus::Idle;
            state.active_mins = Some(active);
            state.end_time = Some(end_time);
            state.updated_at = now;

            persist_state(conn, &state)?;
            Ok(state)
        }
        _ => Err(AppError::Validation(format!(
            "Invalid recovery action '{}'. Must be 'resume' or 'stop'.",
            action
        ))),
    }
}

/// Updates the break reminder mode and configuration.
pub fn set_break_mode(
    conn: &Connection,
    mode: &str,
    config: Option<BreakConfig>,
) -> Result<(), AppError> {
    let mut state = get_tracker_state(conn)?;

    state.break_mode = match mode {
        "pomodoro" => BreakMode::Pomodoro,
        "custom" => BreakMode::Custom,
        _ => BreakMode::None,
    };

    if let Some(c) = config {
        state.break_config = c;
    }

    state.updated_at = now_iso();
    persist_state(conn, &state)?;
    Ok(())
}

/// Delays the next break reminder by the configured snooze duration.
/// In Pomodoro mode, increments the cycle counter so the frontend can
/// schedule the correct next interval after the snooze elapses.
pub fn snooze_break(conn: &Connection) -> Result<(), AppError> {
    let mut state = get_tracker_state(conn)?;

    if state.break_mode == BreakMode::Pomodoro {
        state.pomodoro_cycle += 1;
    }

    state.updated_at = now_iso();
    persist_state(conn, &state)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Time Entry CRUD
// ---------------------------------------------------------------------------

/// Lists time entries matching the given filters.
#[allow(clippy::too_many_arguments)]
pub fn list_time_entries(
    conn: &Connection,
    workspace_id: &str,
    start_date: Option<&str>,
    end_date: Option<&str>,
    category: Option<&str>,
    tag: Option<&str>,
    linked_task_id: Option<&str>,
    linked_plan_id: Option<&str>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<TimeEntry>, AppError> {
    let mut sql = String::from(
        "SELECT id, workspace_id, start_time, end_time, pauses, active_mins,
                notes, category, tags, session_notes, linked_plan_id,
                linked_task_id, created_at, updated_at, deleted_at
         FROM time_entries
         WHERE workspace_id = ?1 AND deleted_at IS NULL",
    );

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(workspace_id.to_string())];
    let mut idx = 2;

    if let Some(sd) = start_date {
        sql.push_str(&format!(" AND start_time >= ?{idx}"));
        params.push(Box::new(sd.to_string()));
        idx += 1;
    }
    if let Some(ed) = end_date {
        sql.push_str(&format!(" AND start_time < ?{idx}"));
        params.push(Box::new(ed.to_string()));
        idx += 1;
    }
    if let Some(cat) = category {
        sql.push_str(&format!(" AND category = ?{idx}"));
        params.push(Box::new(cat.to_string()));
        idx += 1;
    }
    if let Some(tid) = linked_task_id {
        sql.push_str(&format!(" AND linked_task_id = ?{idx}"));
        params.push(Box::new(tid.to_string()));
        idx += 1;
    }
    if let Some(pid) = linked_plan_id {
        sql.push_str(&format!(" AND linked_plan_id = ?{idx}"));
        params.push(Box::new(pid.to_string()));
        idx += 1;
    }

    sql.push_str(" ORDER BY start_time DESC");

    if let Some(lim) = limit {
        sql.push_str(&format!(" LIMIT ?{idx}"));
        params.push(Box::new(lim));
        idx += 1;
    }
    if let Some(off) = offset {
        sql.push_str(&format!(" OFFSET ?{idx}"));
        params.push(Box::new(off));
    }

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let entries = stmt
        .query_map(param_refs.as_slice(), |row| {
            let pauses_json: String = row.get(4)?;
            let tags_json: String = row.get(8)?;
            let session_notes_json: String = row.get(9)?;

            Ok(TimeEntry {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                start_time: row.get(2)?,
                end_time: row.get(3)?,
                pauses: serde_json::from_str(&pauses_json).unwrap_or_default(),
                active_mins: row.get(5)?,
                notes: row.get(6)?,
                category: row.get(7)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                session_notes: serde_json::from_str(&session_notes_json).unwrap_or_default(),
                linked_plan_id: row.get(10)?,
                linked_task_id: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
                deleted_at: row.get(14)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // Post-filter by tag if requested (JSON array contains check)
    let entries = if let Some(t) = tag {
        entries
            .into_iter()
            .filter(|e| e.tags.contains(&t.to_string()))
            .collect()
    } else {
        entries
    };

    Ok(entries)
}

/// Updates metadata on a saved (non-running) time entry.
pub fn update_time_entry(
    conn: &Connection,
    id: &str,
    notes: Option<String>,
    category: Option<Option<String>>,
    tags: Option<Vec<String>>,
    linked_plan_id: Option<Option<String>>,
    linked_task_id: Option<Option<String>>,
) -> Result<TimeEntry, AppError> {
    let _existing = read_time_entry(conn, id)?;
    let now = now_iso();

    if let Some(n) = &notes {
        conn.execute(
            "UPDATE time_entries SET notes = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![n, now, id],
        )?;
    }
    if let Some(c) = &category {
        conn.execute(
            "UPDATE time_entries SET category = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![c, now, id],
        )?;
    }
    if let Some(t) = &tags {
        let tags_json = serde_json::to_string(t)?;
        conn.execute(
            "UPDATE time_entries SET tags = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![tags_json, now, id],
        )?;
    }
    if let Some(ref p) = linked_plan_id {
        conn.execute(
            "UPDATE time_entries SET linked_plan_id = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![p, now, id],
        )?;
    }
    if let Some(ref t) = linked_task_id {
        conn.execute(
            "UPDATE time_entries SET linked_task_id = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![t, now, id],
        )?;
    }

    read_time_entry(conn, id)
}

/// Soft-deletes a time entry.
pub fn delete_time_entry(conn: &Connection, id: &str) -> Result<(), AppError> {
    let now = now_iso();
    let updated = conn.execute(
        "UPDATE time_entries SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
        rusqlite::params![now, now, id],
    )?;

    if updated == 0 {
        return Err(AppError::NotFound {
            entity: "TimeEntry".to_string(),
            id: id.to_string(),
        });
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/// Generates a daily time summary for a given date.
pub fn get_daily_summary(
    conn: &Connection,
    workspace_id: &str,
    date: &str,
) -> Result<DailySummary, AppError> {
    // Get entries for this date (start_time on date)
    let next_date = next_day(date);
    let entries = list_time_entries(
        conn,
        workspace_id,
        Some(date),
        Some(&next_date),
        None,
        None,
        None,
        None,
        None,
        None,
    )?;

    // Filter to only completed entries
    let completed: Vec<&TimeEntry> = entries.iter().filter(|e| e.active_mins.is_some()).collect();

    let total_mins: i64 = completed.iter().filter_map(|e| e.active_mins).sum();
    let entry_count = completed.len() as i64;

    let by_category = aggregate_by_category(&completed);
    let by_tag = aggregate_by_tag(&completed);

    Ok(DailySummary {
        date: date.to_string(),
        total_mins,
        entry_count,
        by_category,
        by_tag,
    })
}

/// Generates a weekly time summary starting from the given Monday date.
pub fn get_weekly_summary(
    conn: &Connection,
    workspace_id: &str,
    week_start: &str,
) -> Result<WeeklySummary, AppError> {
    let mut daily_breakdown = Vec::with_capacity(7);
    let mut all_entries = Vec::new();
    let mut current = week_start.to_string();

    for _ in 0..7 {
        let summary = get_daily_summary(conn, workspace_id, &current)?;
        daily_breakdown.push(summary);

        let next = next_day(&current);
        let day_entries = list_time_entries(
            conn,
            workspace_id,
            Some(&current),
            Some(&next),
            None,
            None,
            None,
            None,
            None,
            None,
        )?;
        all_entries.extend(day_entries);
        current = next;
    }

    let week_end = shift_day(week_start, 6);
    let completed: Vec<&TimeEntry> = all_entries.iter().filter(|e| e.active_mins.is_some()).collect();
    let total_mins: i64 = completed.iter().filter_map(|e| e.active_mins).sum();
    let by_category = aggregate_by_category(&completed);
    let by_tag = aggregate_by_tag(&completed);

    Ok(WeeklySummary {
        week_start: week_start.to_string(),
        week_end,
        total_mins,
        daily_breakdown,
        by_category,
        by_tag,
    })
}

/// Returns all time entries linked to a specific task.
pub fn get_entries_for_task(conn: &Connection, task_id: &str) -> Result<Vec<TimeEntry>, AppError> {
    let workspace_id: String = conn
        .query_row("SELECT workspace_id FROM tasks WHERE id = ?1", [task_id], |row| row.get(0))
        .unwrap_or_default();

    list_time_entries(conn, &workspace_id, None, None, None, None, Some(task_id), None, None, None)
}

/// Returns all time entries linked to a specific plan.
pub fn get_entries_for_plan(conn: &Connection, plan_id: &str) -> Result<Vec<TimeEntry>, AppError> {
    let workspace_id: String = conn
        .query_row("SELECT workspace_id FROM plans WHERE id = ?1", [plan_id], |row| row.get(0))
        .unwrap_or_default();

    list_time_entries(conn, &workspace_id, None, None, None, None, None, Some(plan_id), None, None)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Creates a `time_logged` reference from a time entry to a target entity.
fn create_time_logged_ref(
    conn: &Connection,
    entry_id: &str,
    target_type: &str,
    target_id: &str,
) -> Result<(), AppError> {
    let ref_id = generate_id();
    let now = now_iso();
    // Avoid duplicates
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM refs WHERE source_type = 'time_entry' AND source_id = ?1
         AND target_type = ?2 AND target_id = ?3 AND relation = 'time_logged'",
        rusqlite::params![entry_id, target_type, target_id],
        |row| row.get(0),
    )?;

    if !exists {
        conn.execute(
            "INSERT INTO refs (id, source_type, source_id, target_type, target_id, relation, created_at)
             VALUES (?1, 'time_entry', ?2, ?3, ?4, 'time_logged', ?5)",
            rusqlite::params![ref_id, entry_id, target_type, target_id, now],
        )?;
    }

    Ok(())
}

/// Spawns a new task from a completed tracking session.
fn spawn_task_from_session(
    conn: &Connection,
    entry: &TimeEntry,
    input: &CreateTaskFromSession,
) -> Result<(), AppError> {
    let task_id = generate_id();
    let now = now_iso();
    let active = entry.active_mins.unwrap_or(0);

    conn.execute(
        "INSERT INTO tasks (id, workspace_id, title, description, status, priority,
            actual_mins, is_sticky, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'todo', 'none', ?5, 0, ?6, ?7)",
        rusqlite::params![
            task_id,
            entry.workspace_id,
            input.title,
            input.description,
            active,
            now,
            now,
        ],
    )?;

    // Link entry -> task
    create_time_logged_ref(conn, &entry.id, "task", &task_id)?;

    // Also create spawned_from reference
    let ref_id = generate_id();
    conn.execute(
        "INSERT INTO refs (id, source_type, source_id, target_type, target_id, relation, created_at)
         VALUES (?1, 'task', ?2, 'time_entry', ?3, 'spawned_from', ?4)",
        rusqlite::params![ref_id, task_id, entry.id, now],
    )?;

    Ok(())
}

/// Spawns a new note from a completed tracking session.
fn spawn_note_from_session(
    conn: &Connection,
    entry: &TimeEntry,
    input: &CreateNoteFromSession,
) -> Result<(), AppError> {
    let note_id = generate_id();
    let now = now_iso();

    // Build note body from session timeline
    let mut body = format!("# {}\n\n", input.title);
    if !entry.session_notes.is_empty() {
        body.push_str("## Session Timeline\n\n");
        for sn in &entry.session_notes {
            body.push_str(&format!("- **+{:.0}min** ({}): {}\n", sn.elapsed_mins, sn.wall_time, sn.text));
        }
        body.push('\n');
    }
    if !entry.notes.is_empty() {
        body.push_str("## Notes\n\n");
        body.push_str(&entry.notes);
        body.push('\n');
    }

    conn.execute(
        "INSERT INTO notes (id, workspace_id, title, body, folder, category, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?7)",
        rusqlite::params![
            note_id,
            entry.workspace_id,
            input.title,
            body,
            input.folder,
            now,
            now,
        ],
    )?;

    // Spawned_from reference
    let ref_id = generate_id();
    conn.execute(
        "INSERT INTO refs (id, source_type, source_id, target_type, target_id, relation, created_at)
         VALUES (?1, 'note', ?2, 'time_entry', ?3, 'spawned_from', ?4)",
        rusqlite::params![ref_id, note_id, entry.id, now],
    )?;

    Ok(())
}

/// Returns the next date string (YYYY-MM-DD) after the given date.
fn next_day(date: &str) -> String {
    shift_day(date, 1)
}

/// Shifts a date string by the given number of days.
fn shift_day(date: &str, days: i64) -> String {
    if let Ok(d) = NaiveDate::parse_from_str(date, "%Y-%m-%d") {
        if let Some(shifted) = d.checked_add_signed(chrono::Duration::days(days)) {
            return shifted.format("%Y-%m-%d").to_string();
        }
    }
    date.to_string()
}

/// Aggregates time entries by category.
fn aggregate_by_category(entries: &[&TimeEntry]) -> Vec<CategoryTime> {
    let mut map: std::collections::HashMap<Option<String>, (i64, i64)> = std::collections::HashMap::new();
    for e in entries {
        let mins = e.active_mins.unwrap_or(0);
        let counter = map.entry(e.category.clone()).or_insert((0, 0));
        counter.0 += mins;
        counter.1 += 1;
    }
    map.into_iter()
        .map(|(cat, (total_mins, entry_count))| CategoryTime {
            category: cat,
            total_mins,
            entry_count,
        })
        .collect()
}

/// Aggregates time entries by tag.
fn aggregate_by_tag(entries: &[&TimeEntry]) -> Vec<TagTime> {
    let mut map: std::collections::HashMap<String, (i64, i64)> = std::collections::HashMap::new();
    for e in entries {
        let mins = e.active_mins.unwrap_or(0);
        for tag in &e.tags {
            let counter = map.entry(tag.clone()).or_insert((0, 0));
            counter.0 += mins;
            counter.1 += 1;
        }
    }
    map.into_iter()
        .map(|(tag, (total_mins, entry_count))| TagTime {
            tag,
            total_mins,
            entry_count,
        })
        .collect()
}
