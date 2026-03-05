use crate::models::recurrence::{
    CreateRecurrenceRuleInput, EntitySummary, RecurrenceRule, UpdateRecurrenceRuleInput,
};
use crate::services::activity::log_activity;
use crate::services::recurrence;
use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::{id::generate_id, time::now_iso};
use chrono::NaiveDate;
use tauri::State;

/// Reads a recurrence rule from the database.
fn read_rule(conn: &rusqlite::Connection, id: &str) -> Result<RecurrenceRule, AppError> {
    let rule = conn.query_row(
        "SELECT id, workspace_id, entity_type, parent_entity_id, pattern,
                interval, days_of_week, day_of_month, month_of_year,
                end_date, end_after_count, occurrences_created,
                next_occurrence_date, is_active, created_at, updated_at
         FROM recurrence_rules WHERE id = ?1",
        [id],
        |row| {
            let days_str: Option<String> = row.get(6)?;
            let days = days_str
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok());

            Ok(RecurrenceRule {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                entity_type: row.get(2)?,
                parent_entity_id: row.get(3)?,
                pattern: row.get(4)?,
                interval: row.get::<_, u32>(5)?,
                days_of_week: days,
                day_of_month: row.get::<_, Option<u8>>(7)?,
                month_of_year: row.get::<_, Option<u8>>(8)?,
                end_date: row.get(9)?,
                end_after_count: row.get::<_, Option<u32>>(10)?,
                occurrences_created: row.get::<_, u32>(11)?,
                next_occurrence_date: row.get(12)?,
                is_active: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        },
    );

    match rule {
        Ok(r) => Ok(r),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(AppError::NotFound {
            entity: "RecurrenceRule".to_string(),
            id: id.to_string(),
        }),
        Err(e) => Err(AppError::Database(e)),
    }
}

/// Creates a new recurrence rule for a task or plan.
#[tauri::command]
pub fn create_recurrence_rule(
    state: State<'_, AppState>,
    input: CreateRecurrenceRuleInput,
) -> Result<RecurrenceRule, AppError> {
    let id = generate_id();
    let now = now_iso();
    let interval = input.interval.unwrap_or(1);

    // Compute the initial next_occurrence_date from the parent entity
    let next_date = state
        .db
        .with_conn(|conn| {
            let from_date_str = get_entity_date(conn, &input.entity_type, &input.parent_entity_id)?;
            Ok(from_date_str)
        })
        .map_err(AppError::Database)?;

    let next_occurrence = if let Some(ref date_str) = next_date {
        if let Ok(from_d) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
            recurrence::compute_next_date(
                &input.pattern,
                interval,
                &from_d,
                &input.days_of_week,
                input.day_of_month,
                input.month_of_year,
                &input.end_date,
                input.end_after_count,
                0,
            )
            .map(|d| d.format("%Y-%m-%d").to_string())
        } else {
            None
        }
    } else {
        None
    };

    let days_json = input
        .days_of_week
        .as_ref()
        .map(|d| serde_json::to_string(d).unwrap_or_default());

    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "INSERT INTO recurrence_rules (id, workspace_id, entity_type, parent_entity_id,
                    pattern, interval, days_of_week, day_of_month, month_of_year,
                    end_date, end_after_count, occurrences_created,
                    next_occurrence_date, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, ?12, 1, ?13, ?13)",
                rusqlite::params![
                    id,
                    input.workspace_id,
                    input.entity_type,
                    input.parent_entity_id,
                    input.pattern,
                    interval,
                    days_json,
                    input.day_of_month,
                    input.month_of_year,
                    input.end_date,
                    input.end_after_count,
                    next_occurrence,
                    now,
                ],
            )?;

            // Link the parent entity to this rule (occurrence_index = 0)
            match input.entity_type.as_str() {
                "task" => {
                    conn.execute(
                        "UPDATE tasks SET recurrence_rule_id = ?1, occurrence_index = 0, updated_at = ?2 WHERE id = ?3",
                        rusqlite::params![id, now, input.parent_entity_id],
                    )?;
                }
                "plan" => {
                    conn.execute(
                        "UPDATE plans SET recurrence_rule_id = ?1, occurrence_index = 0, updated_at = ?2 WHERE id = ?3",
                        rusqlite::params![id, now, input.parent_entity_id],
                    )?;
                }
                _ => {}
            }

            Ok(())
        })
        .map_err(AppError::Database)?;

    let rule = state
        .db
        .with_conn(|conn| {
            read_rule(conn, &id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })
        })
        .map_err(AppError::Database)?;

    let _ = state.db.with_conn(|conn| {
        log_activity(
            conn,
            &input.workspace_id,
            "recurrence_rule",
            &id,
            Some(&format!("Recurrence: {}", input.pattern)),
            "created",
            None,
        )
    });

    Ok(rule)
}

/// Gets a recurrence rule by ID.
#[tauri::command]
pub fn get_recurrence_rule(
    state: State<'_, AppState>,
    rule_id: String,
) -> Result<RecurrenceRule, AppError> {
    state
        .db
        .with_conn(|conn| {
            read_rule(conn, &rule_id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })
        })
        .map_err(AppError::Database)
}

/// Gets the recurrence rule for a specific task or plan.
#[tauri::command]
pub fn get_recurrence_rule_for_entity(
    state: State<'_, AppState>,
    entity_type: String,
    entity_id: String,
) -> Result<Option<RecurrenceRule>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let rule_id: Option<String> = match entity_type.as_str() {
                "task" => conn
                    .query_row(
                        "SELECT recurrence_rule_id FROM tasks WHERE id = ?1",
                        [&entity_id],
                        |row| row.get::<_, Option<String>>(0),
                    )
                    .ok()
                    .flatten(),
                "plan" => conn
                    .query_row(
                        "SELECT recurrence_rule_id FROM plans WHERE id = ?1",
                        [&entity_id],
                        |row| row.get::<_, Option<String>>(0),
                    )
                    .ok()
                    .flatten(),
                _ => None,
            };

            match rule_id {
                Some(ref rid) => {
                    match read_rule(conn, rid) {
                        Ok(r) => Ok(Some(r)),
                        Err(_) => Ok(None),
                    }
                }
                None => Ok(None),
            }
        })
        .map_err(AppError::Database)
}

/// Updates a recurrence rule (affects future occurrences).
#[tauri::command]
pub fn update_recurrence_rule(
    state: State<'_, AppState>,
    rule_id: String,
    update: UpdateRecurrenceRuleInput,
) -> Result<RecurrenceRule, AppError> {
    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            let existing = read_rule(conn, &rule_id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })?;

            let pattern = update.pattern.as_deref().unwrap_or(&existing.pattern);
            let interval = update.interval.unwrap_or(existing.interval);
            let days_of_week = match &update.days_of_week {
                Some(Some(d)) => Some(d.clone()),
                Some(None) => None,
                None => existing.days_of_week.clone(),
            };
            let day_of_month = match update.day_of_month {
                Some(Some(d)) => Some(d),
                Some(None) => None,
                None => existing.day_of_month,
            };
            let month_of_year = match update.month_of_year {
                Some(Some(m)) => Some(m),
                Some(None) => None,
                None => existing.month_of_year,
            };
            let end_date = match &update.end_date {
                Some(Some(d)) => Some(d.clone()),
                Some(None) => None,
                None => existing.end_date.clone(),
            };
            let end_after_count = match update.end_after_count {
                Some(Some(c)) => Some(c),
                Some(None) => None,
                None => existing.end_after_count,
            };
            let is_active = update.is_active.unwrap_or(existing.is_active);

            // Recompute next_occurrence_date
            let from_date_str = get_entity_date(
                conn,
                &existing.entity_type,
                &existing.parent_entity_id,
            )?;
            let next_occurrence = if let Some(ref date_str) = from_date_str {
                if let Ok(from_d) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                    recurrence::compute_next_date(
                        pattern,
                        interval,
                        &from_d,
                        &days_of_week,
                        day_of_month,
                        month_of_year,
                        &end_date,
                        end_after_count,
                        existing.occurrences_created,
                    )
                    .map(|d| d.format("%Y-%m-%d").to_string())
                } else {
                    None
                }
            } else {
                existing.next_occurrence_date.clone()
            };

            let days_json = days_of_week
                .as_ref()
                .map(|d| serde_json::to_string(d).unwrap_or_default());

            conn.execute(
                "UPDATE recurrence_rules SET pattern = ?1, interval = ?2,
                    days_of_week = ?3, day_of_month = ?4, month_of_year = ?5,
                    end_date = ?6, end_after_count = ?7, is_active = ?8,
                    next_occurrence_date = ?9, updated_at = ?10
                 WHERE id = ?11",
                rusqlite::params![
                    pattern,
                    interval,
                    days_json,
                    day_of_month,
                    month_of_year,
                    end_date,
                    end_after_count,
                    is_active,
                    next_occurrence,
                    now,
                    rule_id,
                ],
            )?;

            read_rule(conn, &rule_id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })
        })
        .map_err(AppError::Database)
}

/// Deactivates and deletes a recurrence rule.
#[tauri::command]
pub fn delete_recurrence_rule(
    state: State<'_, AppState>,
    rule_id: String,
) -> Result<(), AppError> {
    let now = now_iso();
    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "UPDATE recurrence_rules SET is_active = 0, updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, rule_id],
            )?;

            // Unlink all entities from this rule
            conn.execute(
                "UPDATE tasks SET recurrence_rule_id = NULL, occurrence_index = NULL, updated_at = ?1 WHERE recurrence_rule_id = ?2",
                rusqlite::params![now, rule_id],
            )?;
            conn.execute(
                "UPDATE plans SET recurrence_rule_id = NULL, occurrence_index = NULL, updated_at = ?1 WHERE recurrence_rule_id = ?2",
                rusqlite::params![now, rule_id],
            )?;

            Ok(())
        })
        .map_err(AppError::Database)
}

/// Skips the next occurrence without generating it.
#[tauri::command]
pub fn skip_next_occurrence(
    state: State<'_, AppState>,
    rule_id: String,
) -> Result<RecurrenceRule, AppError> {
    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            let existing = read_rule(conn, &rule_id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })?;

            let new_count = existing.occurrences_created + 1;

            // Compute the next date after the skipped one
            let next_occurrence = if let Some(ref next_str) = existing.next_occurrence_date {
                if let Ok(next_d) = NaiveDate::parse_from_str(next_str, "%Y-%m-%d") {
                    recurrence::compute_next_date(
                        &existing.pattern,
                        existing.interval,
                        &next_d,
                        &existing.days_of_week,
                        existing.day_of_month,
                        existing.month_of_year,
                        &existing.end_date,
                        existing.end_after_count,
                        new_count,
                    )
                    .map(|d| d.format("%Y-%m-%d").to_string())
                } else {
                    None
                }
            } else {
                None
            };

            let is_active = next_occurrence.is_some();

            conn.execute(
                "UPDATE recurrence_rules SET occurrences_created = ?1,
                    next_occurrence_date = ?2, is_active = ?3, updated_at = ?4
                 WHERE id = ?5",
                rusqlite::params![new_count, next_occurrence, is_active, now, rule_id],
            )?;

            read_rule(conn, &rule_id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })
        })
        .map_err(AppError::Database)
}

/// Postpones the next occurrence to a specific date.
#[tauri::command]
pub fn postpone_next_occurrence(
    state: State<'_, AppState>,
    rule_id: String,
    new_date: String,
) -> Result<RecurrenceRule, AppError> {
    let now = now_iso();
    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "UPDATE recurrence_rules SET next_occurrence_date = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![new_date, now, rule_id],
            )?;

            read_rule(conn, &rule_id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })
        })
        .map_err(AppError::Database)
}

/// Detaches a single occurrence from its recurrence rule.
#[tauri::command]
pub fn detach_occurrence(
    state: State<'_, AppState>,
    entity_type: String,
    entity_id: String,
) -> Result<(), AppError> {
    let now = now_iso();
    state
        .db
        .with_conn(|conn| {
            match entity_type.as_str() {
                "task" => {
                    conn.execute(
                        "UPDATE tasks SET recurrence_rule_id = NULL, occurrence_index = NULL, updated_at = ?1 WHERE id = ?2",
                        rusqlite::params![now, entity_id],
                    )?;
                }
                "plan" => {
                    conn.execute(
                        "UPDATE plans SET recurrence_rule_id = NULL, occurrence_index = NULL, updated_at = ?1 WHERE id = ?2",
                        rusqlite::params![now, entity_id],
                    )?;
                }
                _ => {}
            }
            Ok(())
        })
        .map_err(AppError::Database)
}

/// Updates rule for all future occurrences.
#[tauri::command]
pub fn edit_future_occurrences(
    state: State<'_, AppState>,
    rule_id: String,
    update: UpdateRecurrenceRuleInput,
) -> Result<(), AppError> {
    // Delegate to update_recurrence_rule
    update_recurrence_rule(state, rule_id, update)?;
    Ok(())
}

/// Soft-deletes all occurrences after a given index and deactivates the rule.
#[tauri::command]
pub fn delete_future_occurrences(
    state: State<'_, AppState>,
    rule_id: String,
    after_index: u32,
) -> Result<(), AppError> {
    let now = now_iso();
    state
        .db
        .with_conn(|conn| {
            let existing = read_rule(conn, &rule_id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })?;

            match existing.entity_type.as_str() {
                "task" => {
                    conn.execute(
                        "UPDATE tasks SET deleted_at = ?1, updated_at = ?1
                         WHERE recurrence_rule_id = ?2 AND occurrence_index > ?3 AND deleted_at IS NULL",
                        rusqlite::params![now, rule_id, after_index],
                    )?;
                }
                "plan" => {
                    conn.execute(
                        "UPDATE plans SET deleted_at = ?1, updated_at = ?1
                         WHERE recurrence_rule_id = ?2 AND occurrence_index > ?3 AND deleted_at IS NULL",
                        rusqlite::params![now, rule_id, after_index],
                    )?;
                }
                _ => {}
            }

            conn.execute(
                "UPDATE recurrence_rules SET is_active = 0, updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, rule_id],
            )?;

            Ok(())
        })
        .map_err(AppError::Database)
}

/// Lists all occurrences of a rule within a date range.
#[tauri::command]
pub fn get_occurrences(
    state: State<'_, AppState>,
    rule_id: String,
    from_date: String,
    to_date: String,
) -> Result<Vec<EntitySummary>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let existing = read_rule(conn, &rule_id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })?;

            let mut results = Vec::new();

            match existing.entity_type.as_str() {
                "task" => {
                    let mut stmt = conn.prepare(
                        "SELECT id, title, occurrence_index, scheduled_date, status
                         FROM tasks
                         WHERE recurrence_rule_id = ?1
                           AND deleted_at IS NULL
                           AND (scheduled_date >= ?2 AND scheduled_date <= ?3
                                OR scheduled_date IS NULL)
                         ORDER BY occurrence_index ASC",
                    )?;

                    let rows = stmt.query_map(
                        rusqlite::params![rule_id, from_date, to_date],
                        |row| {
                            Ok(EntitySummary {
                                id: row.get(0)?,
                                entity_type: "task".to_string(),
                                title: row.get(1)?,
                                occurrence_index: row.get(2)?,
                                date: row.get(3)?,
                                status: row.get(4)?,
                            })
                        },
                    )?;

                    for row in rows {
                        results.push(row?);
                    }
                }
                "plan" => {
                    let mut stmt = conn.prepare(
                        "SELECT id, title, occurrence_index, start_time, NULL
                         FROM plans
                         WHERE recurrence_rule_id = ?1
                           AND deleted_at IS NULL
                           AND start_time >= ?2
                           AND start_time <= ?3
                         ORDER BY occurrence_index ASC",
                    )?;

                    let rows = stmt.query_map(
                        rusqlite::params![rule_id, from_date, to_date],
                        |row| {
                            Ok(EntitySummary {
                                id: row.get(0)?,
                                entity_type: "plan".to_string(),
                                title: row.get(1)?,
                                occurrence_index: row.get(2)?,
                                date: row.get(3)?,
                                status: row.get::<_, Option<String>>(4)?,
                            })
                        },
                    )?;

                    for row in rows {
                        results.push(row?);
                    }
                }
                _ => {}
            }

            Ok(results)
        })
        .map_err(AppError::Database)
}

/// Generates pending plan occurrences up to a given date.
#[tauri::command]
pub fn generate_pending_occurrences(
    state: State<'_, AppState>,
    workspace_id: String,
    up_to_date: String,
) -> Result<Vec<String>, AppError> {
    let up_to = NaiveDate::parse_from_str(&up_to_date, "%Y-%m-%d").map_err(|e| {
        AppError::Validation(format!("Invalid date: {}", e))
    })?;

    state
        .db
        .with_conn(|conn| {
            let mut generated = Vec::new();

            // Get all active rules for this workspace that need generation
            let mut stmt = conn.prepare(
                "SELECT id FROM recurrence_rules
                 WHERE workspace_id = ?1
                   AND is_active = 1
                   AND next_occurrence_date IS NOT NULL
                   AND next_occurrence_date <= ?2",
            )?;

            let rule_ids: Vec<String> = stmt
                .query_map(rusqlite::params![workspace_id, up_to_date], |row| {
                    row.get(0)
                })?
                .filter_map(|r| r.ok())
                .collect();

            for rule_id in rule_ids {
                let rule = match read_rule(conn, &rule_id) {
                    Ok(r) => r,
                    Err(_) => continue,
                };

                if let Some(ref next_str) = rule.next_occurrence_date {
                    if let Ok(next_d) = NaiveDate::parse_from_str(next_str, "%Y-%m-%d") {
                        if next_d <= up_to {
                            if let Ok(Some(id)) = generate_occurrence(conn, &rule) {
                                generated.push(id);
                            }
                        }
                    }
                }
            }

            Ok(generated)
        })
        .map_err(AppError::Database)
}

/// Generates the next occurrence for a recurrence rule.
///
/// Called internally when a recurring task is completed or a plan's date passes.
pub fn generate_occurrence(
    conn: &rusqlite::Connection,
    rule: &RecurrenceRule,
) -> Result<Option<String>, rusqlite::Error> {
    if !rule.is_active {
        return Ok(None);
    }

    if recurrence::is_exhausted(
        &rule.end_date,
        rule.end_after_count,
        rule.occurrences_created,
        &rule.next_occurrence_date,
    ) {
        conn.execute(
            "UPDATE recurrence_rules SET is_active = 0, updated_at = ?1 WHERE id = ?2",
            rusqlite::params![crate::utils::time::now_iso(), rule.id],
        )?;
        return Ok(None);
    }

    let next_date = match &rule.next_occurrence_date {
        Some(d) => match NaiveDate::parse_from_str(d, "%Y-%m-%d") {
            Ok(nd) => nd,
            Err(_) => return Ok(None),
        },
        None => return Ok(None),
    };

    let now = crate::utils::time::now_iso();
    let new_id = crate::utils::id::generate_id();
    let new_index = rule.occurrences_created + 1;

    match rule.entity_type.as_str() {
        "task" => {
            // Clone parent task
            conn.execute(
                "INSERT INTO tasks (id, workspace_id, title, description, status, priority,
                    due_date, scheduled_date, completed_at, category, color, tags,
                    estimated_mins, actual_mins, recurrence, parent_task_id, is_sticky,
                    recurrence_rule_id, occurrence_index, created_at, updated_at)
                 SELECT ?1, workspace_id, title, description, 'todo', priority,
                    NULL, ?2, NULL, category, color, tags,
                    estimated_mins, 0, recurrence, parent_task_id, is_sticky,
                    ?3, ?4, ?5, ?5
                 FROM tasks WHERE id = ?6",
                rusqlite::params![
                    new_id,
                    next_date.format("%Y-%m-%d").to_string(),
                    rule.id,
                    new_index,
                    now,
                    rule.parent_entity_id,
                ],
            )?;

            // Adjust due_date if parent had one
            let parent_due: Option<String> = conn
                .query_row(
                    "SELECT due_date FROM tasks WHERE id = ?1",
                    [&rule.parent_entity_id],
                    |row| row.get(0),
                )
                .ok()
                .flatten();
            let parent_sched: Option<String> = conn
                .query_row(
                    "SELECT scheduled_date FROM tasks WHERE id = ?1",
                    [&rule.parent_entity_id],
                    |row| row.get(0),
                )
                .ok()
                .flatten();

            if let Some(new_due) =
                recurrence::adjust_due_date(&parent_due, &parent_sched, &next_date)
            {
                conn.execute(
                    "UPDATE tasks SET due_date = ?1 WHERE id = ?2",
                    rusqlite::params![new_due, new_id],
                )?;
            }
        }
        "plan" => {
            // Clone parent plan with shifted times
            let parent_start: String = conn.query_row(
                "SELECT start_time FROM plans WHERE id = ?1",
                [&rule.parent_entity_id],
                |row| row.get(0),
            )?;
            let parent_end: String = conn.query_row(
                "SELECT end_time FROM plans WHERE id = ?1",
                [&rule.parent_entity_id],
                |row| row.get(0),
            )?;

            let new_start = recurrence::shift_datetime(&parent_start, &next_date);
            let new_end = recurrence::shift_datetime(&parent_end, &next_date);

            conn.execute(
                "INSERT INTO plans (id, workspace_id, title, description, start_time, end_time,
                    all_day, type, category, color, importance, tags, recurrence,
                    recurrence_rule_id, occurrence_index, created_at, updated_at)
                 SELECT ?1, workspace_id, title, description, ?2, ?3,
                    all_day, type, category, color, importance, tags, recurrence,
                    ?4, ?5, ?6, ?6
                 FROM plans WHERE id = ?7",
                rusqlite::params![
                    new_id,
                    new_start,
                    new_end,
                    rule.id,
                    new_index,
                    now,
                    rule.parent_entity_id,
                ],
            )?;
        }
        _ => return Ok(None),
    }

    // Create reference linking occurrence to parent
    let ref_id = crate::utils::id::generate_id();
    conn.execute(
        "INSERT INTO refs (id, source_type, source_id, target_type, target_id, relation, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'recurrence_of', ?6)",
        rusqlite::params![
            ref_id,
            rule.entity_type,
            new_id,
            rule.entity_type,
            rule.parent_entity_id,
            now,
        ],
    )?;

    // Compute next occurrence after this one
    let future_next = recurrence::compute_next_date(
        &rule.pattern,
        rule.interval,
        &next_date,
        &rule.days_of_week,
        rule.day_of_month,
        rule.month_of_year,
        &rule.end_date,
        rule.end_after_count,
        new_index,
    )
    .map(|d| d.format("%Y-%m-%d").to_string());

    let still_active = future_next.is_some();

    conn.execute(
        "UPDATE recurrence_rules SET occurrences_created = ?1,
            next_occurrence_date = ?2, is_active = ?3, updated_at = ?4
         WHERE id = ?5",
        rusqlite::params![new_index, future_next, still_active, now, rule.id],
    )?;

    Ok(Some(new_id))
}

/// Gets the relevant date string from an entity (scheduled_date for tasks, start_time for plans).
fn get_entity_date(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_id: &str,
) -> Result<Option<String>, rusqlite::Error> {
    match entity_type {
        "task" => {
            let date: Option<String> = conn
                .query_row(
                    "SELECT COALESCE(scheduled_date, due_date) FROM tasks WHERE id = ?1",
                    [entity_id],
                    |row| row.get(0),
                )
                .ok()
                .flatten();
            Ok(date.or_else(|| {
                Some(chrono::Local::now().format("%Y-%m-%d").to_string())
            }))
        }
        "plan" => {
            let start: Option<String> = conn
                .query_row(
                    "SELECT start_time FROM plans WHERE id = ?1",
                    [entity_id],
                    |row| row.get(0),
                )
                .ok();
            Ok(start.map(|s| s[..10].to_string()))
        }
        _ => Ok(None),
    }
}
