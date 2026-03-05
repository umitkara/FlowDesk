use crate::models::plan::{
    AgendaItem, CreatePlanInput, DailyPlanSummary, Plan, PlanLinkedNote, PlanLinkedTask, PlanQuery,
    PlanWithLinks, SpawnNoteInput, SpawnTaskInput, UpdatePlanInput, VALID_IMPORTANCE,
    VALID_PLAN_TYPES,
};
use crate::services::activity::log_activity;
use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::{id::generate_id, time::now_iso};
use tauri::State;

/// Reads a single plan row from the database into a `Plan` struct.
fn read_plan(conn: &rusqlite::Connection, id: &str) -> Result<Plan, AppError> {
    let plan = conn.query_row(
        "SELECT id, workspace_id, title, description, start_time, end_time,
                all_day, type, category, color, importance,
                tags, recurrence, created_at, updated_at, deleted_at
         FROM plans WHERE id = ?1",
        [id],
        |row| {
            let tags_str: Option<String> = row.get(11)?;
            let tags = tags_str
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok());

            let recurrence_str: Option<String> = row.get(12)?;
            let recurrence = recurrence_str
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok());

            Ok(Plan {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                start_time: row.get(4)?,
                end_time: row.get(5)?,
                all_day: row.get(6)?,
                plan_type: row.get(7)?,
                category: row.get(8)?,
                color: row.get(9)?,
                importance: row.get(10)?,
                tags,
                recurrence,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
                deleted_at: row.get(15)?,
            })
        },
    );

    match plan {
        Ok(p) => Ok(p),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(AppError::NotFound {
            entity: "Plan".to_string(),
            id: id.to_string(),
        }),
        Err(e) => Err(AppError::Database(e)),
    }
}

/// Validates that a plan title is non-empty.
fn validate_title(title: &str) -> Result<(), AppError> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation(
            "Plan title must be non-empty".to_string(),
        ));
    }
    if trimmed.len() > 500 {
        return Err(AppError::Validation(
            "Plan title must be 500 characters or less".to_string(),
        ));
    }
    Ok(())
}

/// Returns true for plan types that are point-in-time (no duration).
fn is_point_in_time(plan_type: &str) -> bool {
    matches!(plan_type, "milestone" | "deadline" | "reminder")
}

/// Validates that a plan type is one of the allowed values.
fn validate_plan_type(plan_type: &str) -> Result<(), AppError> {
    if !VALID_PLAN_TYPES.contains(&plan_type) {
        return Err(AppError::Validation(format!(
            "Invalid plan type '{}'. Must be one of: {}",
            plan_type,
            VALID_PLAN_TYPES.join(", ")
        )));
    }
    Ok(())
}

/// Validates that importance is one of the allowed values or null.
fn validate_importance(importance: &str) -> Result<(), AppError> {
    if !VALID_IMPORTANCE.contains(&importance) {
        return Err(AppError::Validation(format!(
            "Invalid importance '{}'. Must be one of: {}",
            importance,
            VALID_IMPORTANCE.join(", ")
        )));
    }
    Ok(())
}

/// Validates that end_time >= start_time.
fn validate_date_range(start_time: &str, end_time: &str) -> Result<(), AppError> {
    if end_time < start_time {
        return Err(AppError::Validation(
            "end_time must be greater than or equal to start_time".to_string(),
        ));
    }
    Ok(())
}

/// Converts an AppError to rusqlite::Error for use inside with_conn closures.
fn to_sql_err(e: AppError) -> rusqlite::Error {
    match e {
        AppError::Database(db_err) => db_err,
        other => {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                other.to_string(),
            )))
        }
    }
}

/// Sanitizes a search query for FTS5 by escaping special characters.
fn sanitize_fts_query(query: &str) -> String {
    let cleaned: String = query
        .chars()
        .filter(|c| !matches!(c, '"' | '*' | '(' | ')' | '{' | '}' | ':' | '^'))
        .collect();
    let trimmed = cleaned.trim().to_string();
    if trimmed.is_empty() {
        return "\"\"".to_string();
    }
    trimmed
        .split_whitespace()
        .map(|word| format!("\"{}\"", word))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Extracts the date portion (YYYY-MM-DD) from an ISO 8601 datetime string.
fn extract_date(datetime: &str) -> String {
    datetime.chars().take(10).collect()
}

/// Creates a new plan.
///
/// Generates a UUID v7 ID, applies defaults for `all_day` (false) and `plan_type`
/// ("time_block"). For milestone type, forces `end_time = start_time`.
#[tauri::command]
pub fn create_plan(state: State<'_, AppState>, input: CreatePlanInput) -> Result<Plan, AppError> {
    validate_title(&input.title)?;

    let plan_type = input.plan_type.as_deref().unwrap_or("time_block");
    validate_plan_type(plan_type)?;

    if let Some(ref imp) = input.importance {
        validate_importance(imp)?;
    }

    let all_day = input.all_day.unwrap_or(false);

    // For point-in-time types (milestone, deadline, reminder), end_time = start_time
    let end_time = if is_point_in_time(plan_type) {
        input.start_time.clone()
    } else {
        input.end_time.clone()
    };

    validate_date_range(&input.start_time, &end_time)?;

    let id = generate_id();
    let now = now_iso();
    let tags_json = input
        .tags
        .as_ref()
        .map(|t| serde_json::to_string(t).unwrap_or_else(|_| "[]".to_string()))
        .unwrap_or_else(|| "[]".to_string());
    let recurrence_json = input
        .recurrence
        .as_ref()
        .map(|r| serde_json::to_string(r).unwrap_or_default());

    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "INSERT INTO plans (id, workspace_id, title, description, start_time, end_time,
                                    all_day, type, category, color, importance,
                                    tags, recurrence, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                rusqlite::params![
                    id,
                    input.workspace_id,
                    input.title,
                    input.description,
                    input.start_time,
                    end_time,
                    all_day,
                    plan_type,
                    input.category,
                    input.color,
                    input.importance,
                    tags_json,
                    recurrence_json,
                    now,
                    now,
                ],
            )?;

            // Auto-create default reminders for the plan's start time
            let _ = crate::commands::reminders::create_default_reminders(
                conn, "plan", &id, &input.start_time, &input.workspace_id,
            );

            read_plan(conn, &id).map_err(to_sql_err)
        })
        .map_err(AppError::Database)
        .inspect(|p| {
            // Best-effort activity logging
            let _ = state.db.with_conn(|conn| {
                log_activity(conn, &p.workspace_id, "plan", &p.id, Some(&p.title), "created", None)
            });
        })
}

/// Gets a single plan by ID. Returns 404 if not found or soft-deleted.
#[tauri::command]
pub fn get_plan(state: State<'_, AppState>, id: String) -> Result<Plan, AppError> {
    state
        .db
        .with_conn(|conn| {
            let plan = read_plan(conn, &id).map_err(to_sql_err)?;

            if plan.deleted_at.is_some() {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }

            Ok(plan)
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "Plan".to_string(),
                    id,
                }
            } else {
                AppError::Database(e)
            }
        })
}

/// Updates a plan (patch semantics). Only provided fields are updated.
#[tauri::command]
pub fn update_plan(state: State<'_, AppState>, input: UpdatePlanInput) -> Result<Plan, AppError> {
    let now = now_iso();
    let plan_id = input.id.clone();

    state
        .db
        .with_conn(|conn| {
            let existing = read_plan(conn, &plan_id).map_err(to_sql_err)?;

            if existing.deleted_at.is_some() {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }

            // Validate fields
            if let Some(ref title) = input.title {
                validate_title(title).map_err(to_sql_err)?;
            }

            if let Some(ref pt) = input.plan_type {
                validate_plan_type(pt).map_err(to_sql_err)?;
            }

            if let Some(Some(ref imp)) = input.importance {
                validate_importance(imp).map_err(to_sql_err)?;
            }

            // Determine effective start/end times for validation
            let effective_start = input
                .start_time
                .as_deref()
                .unwrap_or(&existing.start_time);
            let effective_end = input.end_time.as_deref().unwrap_or(&existing.end_time);
            let effective_type = input
                .plan_type
                .as_deref()
                .unwrap_or(&existing.plan_type);

            // For point-in-time types, force end = start
            let final_end = if is_point_in_time(effective_type) {
                effective_start
            } else {
                effective_end
            };

            validate_date_range(effective_start, final_end).map_err(to_sql_err)?;

            // Build dynamic UPDATE
            let mut set_clauses = Vec::new();
            let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
            let mut pidx = 1u32;

            if let Some(ref title) = input.title {
                set_clauses.push(format!("title = ?{}", pidx));
                params.push(Box::new(title.clone()));
                pidx += 1;
            }
            if let Some(ref desc_opt) = input.description {
                set_clauses.push(format!("description = ?{}", pidx));
                params.push(Box::new(desc_opt.clone()));
                pidx += 1;
            }
            if input.start_time.is_some() || (is_point_in_time(effective_type) && input.plan_type.is_some()) {
                set_clauses.push(format!("start_time = ?{}", pidx));
                params.push(Box::new(effective_start.to_string()));
                pidx += 1;
            }
            // Always set end_time if start, end, or type changed (for milestone enforcement)
            if input.end_time.is_some() || input.start_time.is_some() || input.plan_type.is_some() {
                set_clauses.push(format!("end_time = ?{}", pidx));
                params.push(Box::new(final_end.to_string()));
                pidx += 1;
            }
            if let Some(all_day) = input.all_day {
                set_clauses.push(format!("all_day = ?{}", pidx));
                params.push(Box::new(all_day));
                pidx += 1;
            }
            if let Some(ref pt) = input.plan_type {
                set_clauses.push(format!("type = ?{}", pidx));
                params.push(Box::new(pt.clone()));
                pidx += 1;
            }
            if let Some(ref cat_opt) = input.category {
                set_clauses.push(format!("category = ?{}", pidx));
                params.push(Box::new(cat_opt.clone()));
                pidx += 1;
            }
            if let Some(ref color_opt) = input.color {
                set_clauses.push(format!("color = ?{}", pidx));
                params.push(Box::new(color_opt.clone()));
                pidx += 1;
            }
            if let Some(ref imp_opt) = input.importance {
                set_clauses.push(format!("importance = ?{}", pidx));
                params.push(Box::new(imp_opt.clone()));
                pidx += 1;
            }
            if let Some(ref tags) = input.tags {
                let tags_json =
                    serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string());
                set_clauses.push(format!("tags = ?{}", pidx));
                params.push(Box::new(tags_json));
                pidx += 1;
            }
            if let Some(ref rec_opt) = input.recurrence {
                let rec_json = rec_opt
                    .as_ref()
                    .map(|r| serde_json::to_string(r).unwrap_or_default());
                set_clauses.push(format!("recurrence = ?{}", pidx));
                params.push(Box::new(rec_json));
                pidx += 1;
            }

            // Always update timestamp
            set_clauses.push(format!("updated_at = ?{}", pidx));
            params.push(Box::new(now));
            pidx += 1;

            if set_clauses.is_empty() {
                return read_plan(conn, &plan_id).map_err(to_sql_err);
            }

            let sql = format!(
                "UPDATE plans SET {} WHERE id = ?{}",
                set_clauses.join(", "),
                pidx
            );
            params.push(Box::new(plan_id.clone()));

            let param_refs: Vec<&dyn rusqlite::types::ToSql> =
                params.iter().map(|p| p.as_ref()).collect();
            conn.execute(&sql, param_refs.as_slice())?;

            // Re-sync reminders if start_time changed
            if input.start_time.is_some() {
                let existing_offsets = crate::commands::reminders::get_unfired_offsets(
                    conn, "plan", &plan_id,
                ).unwrap_or_default();
                let _ = crate::commands::reminders::delete_unfired_reminders_for_entity(
                    conn, "plan", &plan_id,
                );
                if existing_offsets.is_empty() {
                    let _ = crate::commands::reminders::create_default_reminders(
                        conn, "plan", &plan_id, effective_start, &existing.workspace_id,
                    );
                } else {
                    let _ = crate::commands::reminders::recreate_reminders_with_offsets(
                        conn, "plan", &plan_id, effective_start, &existing.workspace_id, &existing_offsets,
                    );
                }
            }

            read_plan(conn, &plan_id).map_err(to_sql_err)
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "Plan".to_string(),
                    id: plan_id,
                }
            } else {
                AppError::Database(e)
            }
        })
        .inspect(|p| {
            // Best-effort activity logging
            let _ = state.db.with_conn(|conn| {
                log_activity(conn, &p.workspace_id, "plan", &p.id, Some(&p.title), "updated", None)
            });
        })
}

/// Soft-deletes a plan by setting `deleted_at`.
#[tauri::command]
pub fn delete_plan(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let now = now_iso();
    let meta = state
        .db
        .with_conn(|conn| {
            let existing = read_plan(conn, &id).map_err(to_sql_err)?;

            if existing.deleted_at.is_some() {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }

            let meta = (existing.workspace_id.clone(), existing.title.clone());

            conn.execute(
                "UPDATE plans SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, id],
            )?;

            // Delete all reminders for this plan
            let _ = crate::commands::reminders::delete_all_reminders_for_entity(
                conn, "plan", &id,
            );

            Ok(meta)
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "Plan".to_string(),
                    id: id.clone(),
                }
            } else {
                AppError::Database(e)
            }
        })?;

    // Best-effort activity logging
    let _ = state.db.with_conn(|conn| {
        log_activity(conn, &meta.0, "plan", &id, Some(&meta.1), "deleted", None)
    });

    Ok(())
}

/// Lists plans matching the given query parameters.
///
/// Uses an overlapping date range query for calendar views:
/// `start_time < end_before AND end_time > start_after`.
/// Orders by `start_time ASC`.
#[tauri::command]
pub fn list_plans(state: State<'_, AppState>, query: PlanQuery) -> Result<Vec<Plan>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut sql = String::from(
                "SELECT id, workspace_id, title, description, start_time, end_time,
                        all_day, type, category, color, importance,
                        tags, recurrence, created_at, updated_at, deleted_at
                 FROM plans WHERE workspace_id = ?1",
            );
            let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
            params.push(Box::new(query.workspace_id.clone()));
            let mut idx = 2u32;

            // Soft-delete filter
            if !query.include_deleted.unwrap_or(false) {
                sql.push_str(" AND deleted_at IS NULL");
            }

            // Date range overlap: plan.start_time < end_before AND plan.end_time > start_after
            if let Some(ref start_after) = query.start_after {
                sql.push_str(&format!(" AND end_time > ?{}", idx));
                params.push(Box::new(start_after.clone()));
                idx += 1;
            }
            if let Some(ref end_before) = query.end_before {
                sql.push_str(&format!(" AND start_time < ?{}", idx));
                params.push(Box::new(end_before.clone()));
                idx += 1;
            }

            // Type filter
            if let Some(ref plan_type) = query.plan_type {
                sql.push_str(&format!(" AND type = ?{}", idx));
                params.push(Box::new(plan_type.clone()));
                idx += 1;
            }

            // Category filter
            if let Some(ref category) = query.category {
                sql.push_str(&format!(" AND category = ?{}", idx));
                params.push(Box::new(category.clone()));
                idx += 1;
            }

            // Importance filter
            if let Some(ref importance) = query.importance {
                sql.push_str(&format!(" AND importance = ?{}", idx));
                params.push(Box::new(importance.clone()));
                idx += 1;
            }

            sql.push_str(" ORDER BY start_time ASC");

            sql.push_str(&format!(" LIMIT ?{}", idx));
            params.push(Box::new(1000i64));

            let param_refs: Vec<&dyn rusqlite::types::ToSql> =
                params.iter().map(|p| p.as_ref()).collect();

            let mut stmt = conn.prepare(&sql)?;
            let plans = stmt
                .query_map(param_refs.as_slice(), |row| {
                    let tags_str: Option<String> = row.get(11)?;
                    let tags = tags_str
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok());

                    let recurrence_str: Option<String> = row.get(12)?;
                    let recurrence = recurrence_str
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok());

                    Ok(Plan {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        title: row.get(2)?,
                        description: row.get(3)?,
                        start_time: row.get(4)?,
                        end_time: row.get(5)?,
                        all_day: row.get(6)?,
                        plan_type: row.get(7)?,
                        category: row.get(8)?,
                        color: row.get(9)?,
                        importance: row.get(10)?,
                        tags,
                        recurrence,
                        created_at: row.get(13)?,
                        updated_at: row.get(14)?,
                        deleted_at: row.get(15)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(plans)
        })
        .map_err(AppError::Database)
}

/// Gets the aggregated daily plan summary for a single date.
///
/// Includes the daily plan, time blocks, events, milestones, and scheduled tasks.
#[tauri::command]
pub fn get_daily_plan_summary(
    state: State<'_, AppState>,
    workspace_id: String,
    date: String,
) -> Result<DailyPlanSummary, AppError> {
    state
        .db
        .with_conn(|conn| {
            // Date boundaries for the query
            let day_start = format!("{}T00:00:00", date);
            let day_end = format!("{}T23:59:59", date);

            // Get all plans overlapping this date
            let mut stmt = conn.prepare(
                "SELECT id, workspace_id, title, description, start_time, end_time,
                        all_day, type, category, color, importance,
                        tags, recurrence, created_at, updated_at, deleted_at
                 FROM plans
                 WHERE workspace_id = ?1
                   AND deleted_at IS NULL
                   AND start_time <= ?2
                   AND end_time >= ?3
                 ORDER BY start_time ASC",
            )?;

            let plans: Vec<Plan> = stmt
                .query_map(rusqlite::params![workspace_id, day_end, day_start], |row| {
                    let tags_str: Option<String> = row.get(11)?;
                    let tags = tags_str
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok());
                    let recurrence_str: Option<String> = row.get(12)?;
                    let recurrence = recurrence_str
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok());

                    Ok(Plan {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        title: row.get(2)?,
                        description: row.get(3)?,
                        start_time: row.get(4)?,
                        end_time: row.get(5)?,
                        all_day: row.get(6)?,
                        plan_type: row.get(7)?,
                        category: row.get(8)?,
                        color: row.get(9)?,
                        importance: row.get(10)?,
                        tags,
                        recurrence,
                        created_at: row.get(13)?,
                        updated_at: row.get(14)?,
                        deleted_at: row.get(15)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            // Separate by type
            let mut daily_plan = None;
            let mut time_blocks = Vec::new();
            let mut events = Vec::new();
            let mut milestones = Vec::new();
            let mut deadlines = Vec::new();
            let mut meetings = Vec::new();
            let mut reviews = Vec::new();
            let mut habits = Vec::new();
            let mut reminders = Vec::new();

            for plan in plans {
                match plan.plan_type.as_str() {
                    "daily_plan" => daily_plan = Some(plan),
                    "time_block" => time_blocks.push(plan),
                    "event" => events.push(plan),
                    "milestone" => milestones.push(plan),
                    "deadline" => deadlines.push(plan),
                    "meeting" => meetings.push(plan),
                    "review" => reviews.push(plan),
                    "habit" => habits.push(plan),
                    "reminder" => reminders.push(plan),
                    _ => time_blocks.push(plan),
                }
            }

            // Get tasks scheduled for this date (via scheduled_date) or linked to plans on this day
            let mut scheduled_tasks = Vec::new();

            // Tasks with scheduled_date matching this date
            let mut task_stmt = conn.prepare(
                "SELECT id, title, status, priority
                 FROM tasks
                 WHERE workspace_id = ?1
                   AND deleted_at IS NULL
                   AND scheduled_date = ?2
                   AND status NOT IN ('done', 'cancelled')",
            )?;

            let direct_tasks: Vec<PlanLinkedTask> = task_stmt
                .query_map(rusqlite::params![workspace_id, date], |row| {
                    Ok(PlanLinkedTask {
                        task_id: row.get(0)?,
                        title: row.get(1)?,
                        status: row.get(2)?,
                        priority: row.get(3)?,
                        relation: "scheduled".to_string(),
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            scheduled_tasks.extend(direct_tasks);

            // Tasks linked to plans on this day via references
            let plan_ids: Vec<String> = time_blocks
                .iter()
                .chain(events.iter())
                .map(|p| p.id.clone())
                .collect();

            if !plan_ids.is_empty() {
                let placeholders: Vec<String> = plan_ids
                    .iter()
                    .enumerate()
                    .map(|(i, _)| format!("?{}", i + 1))
                    .collect();
                let ref_sql = format!(
                    "SELECT r.source_id, t.title, t.status, t.priority, r.relation
                     FROM refs r
                     JOIN tasks t ON r.source_id = t.id
                     WHERE r.source_type = 'task'
                       AND r.target_type = 'plan'
                       AND r.target_id IN ({})
                       AND t.deleted_at IS NULL",
                    placeholders.join(", ")
                );

                let ref_params: Vec<Box<dyn rusqlite::types::ToSql>> =
                    plan_ids.iter().map(|id| Box::new(id.clone()) as Box<dyn rusqlite::types::ToSql>).collect();
                let ref_param_refs: Vec<&dyn rusqlite::types::ToSql> =
                    ref_params.iter().map(|p| p.as_ref()).collect();

                let mut ref_stmt = conn.prepare(&ref_sql)?;
                let linked_tasks: Vec<PlanLinkedTask> = ref_stmt
                    .query_map(ref_param_refs.as_slice(), |row| {
                        Ok(PlanLinkedTask {
                            task_id: row.get(0)?,
                            title: row.get(1)?,
                            status: row.get(2)?,
                            priority: row.get(3)?,
                            relation: row.get(4)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;

                // Avoid duplicates (tasks may appear via both scheduled_date and reference)
                for lt in linked_tasks {
                    if !scheduled_tasks.iter().any(|st| st.task_id == lt.task_id) {
                        scheduled_tasks.push(lt);
                    }
                }
            }

            Ok(DailyPlanSummary {
                date,
                daily_plan,
                time_blocks,
                events,
                milestones,
                deadlines,
                meetings,
                reviews,
                habits,
                reminders,
                scheduled_tasks,
            })
        })
        .map_err(AppError::Database)
}

/// Gets a plan with all its linked tasks and notes.
#[tauri::command]
pub fn get_plan_with_links(state: State<'_, AppState>, id: String) -> Result<PlanWithLinks, AppError> {
    state
        .db
        .with_conn(|conn| {
            let plan = read_plan(conn, &id).map_err(to_sql_err)?;

            if plan.deleted_at.is_some() {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }

            // Get linked tasks (plan is target, task is source)
            let mut task_stmt = conn.prepare(
                "SELECT r.source_id, t.title, t.status, t.priority, r.relation
                 FROM refs r
                 JOIN tasks t ON r.source_id = t.id
                 WHERE r.target_type = 'plan' AND r.target_id = ?1
                   AND r.source_type = 'task'
                   AND t.deleted_at IS NULL
                 UNION
                 SELECT r.target_id, t.title, t.status, t.priority, r.relation
                 FROM refs r
                 JOIN tasks t ON r.target_id = t.id
                 WHERE r.source_type = 'plan' AND r.source_id = ?1
                   AND r.target_type = 'task'
                   AND t.deleted_at IS NULL",
            )?;

            let linked_tasks: Vec<PlanLinkedTask> = task_stmt
                .query_map([&id], |row| {
                    Ok(PlanLinkedTask {
                        task_id: row.get(0)?,
                        title: row.get(1)?,
                        status: row.get(2)?,
                        priority: row.get(3)?,
                        relation: row.get(4)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            // Get linked notes (plan is target, note is source, or plan is source, note is target)
            let mut note_stmt = conn.prepare(
                "SELECT r.source_id, n.title, n.date, r.relation
                 FROM refs r
                 JOIN notes n ON r.source_id = n.id
                 WHERE r.target_type = 'plan' AND r.target_id = ?1
                   AND r.source_type = 'note'
                   AND n.deleted_at IS NULL
                 UNION
                 SELECT r.target_id, n.title, n.date, r.relation
                 FROM refs r
                 JOIN notes n ON r.target_id = n.id
                 WHERE r.source_type = 'plan' AND r.source_id = ?1
                   AND r.target_type = 'note'
                   AND n.deleted_at IS NULL",
            )?;

            let linked_notes: Vec<PlanLinkedNote> = note_stmt
                .query_map([&id], |row| {
                    Ok(PlanLinkedNote {
                        note_id: row.get(0)?,
                        title: row.get(1)?,
                        date: row.get(2)?,
                        relation: row.get(3)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(PlanWithLinks {
                plan,
                linked_tasks,
                linked_notes,
            })
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "Plan".to_string(),
                    id,
                }
            } else {
                AppError::Database(e)
            }
        })
}

/// Spawns a task from a plan, creating bidirectional references.
///
/// Creates the task with `scheduled_date` defaulting to the plan's start date.
/// Creates two references: plan->task (spawned) and task->plan (spawned_from).
#[tauri::command]
pub fn spawn_task_from_plan(
    state: State<'_, AppState>,
    input: SpawnTaskInput,
) -> Result<PlanLinkedTask, AppError> {
    let plan_id_for_log = input.plan_id.clone();
    state
        .db
        .with_conn(|conn| {
            let plan = read_plan(conn, &input.plan_id).map_err(to_sql_err)?;

            if plan.deleted_at.is_some() {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }

            // Create the task
            let task_id = generate_id();
            let now = now_iso();
            let scheduled_date = input
                .scheduled_date
                .unwrap_or_else(|| extract_date(&plan.start_time));
            let priority = input.priority.as_deref().unwrap_or("none");

            conn.execute(
                "INSERT INTO tasks (id, workspace_id, title, description, status, priority,
                                    scheduled_date, due_date, category, tags,
                                    actual_mins, is_sticky, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 'todo', ?5, ?6, ?7, ?8, '[]', 0, 0, ?9, ?10)",
                rusqlite::params![
                    task_id,
                    plan.workspace_id,
                    input.title,
                    input.description,
                    priority,
                    scheduled_date,
                    input.due_date,
                    plan.category,
                    now,
                    now,
                ],
            )?;

            // Create bidirectional references
            let ref1_id = generate_id();
            let ref2_id = generate_id();

            // plan -> task (spawned)
            conn.execute(
                "INSERT INTO refs (id, source_type, source_id, target_type, target_id, relation, created_at)
                 VALUES (?1, 'plan', ?2, 'task', ?3, 'spawned', ?4)",
                rusqlite::params![ref1_id, input.plan_id, task_id, now],
            )?;

            // task -> plan (spawned_from)
            conn.execute(
                "INSERT INTO refs (id, source_type, source_id, target_type, target_id, relation, created_at)
                 VALUES (?1, 'task', ?2, 'plan', ?3, 'spawned_from', ?4)",
                rusqlite::params![ref2_id, task_id, input.plan_id, now],
            )?;

            Ok((plan.workspace_id.clone(), PlanLinkedTask {
                task_id,
                title: input.title,
                status: "todo".to_string(),
                priority: priority.to_string(),
                relation: "spawned".to_string(),
            }))
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "Plan".to_string(),
                    id: input.plan_id,
                }
            } else {
                AppError::Database(e)
            }
        })
        .inspect(|(wid, linked)| {
            let details = serde_json::json!({"plan_id": plan_id_for_log, "spawned": "task"});
            let _ = state.db.with_conn(|conn| {
                log_activity(conn, wid, "task", &linked.task_id, Some(&linked.title), "created", Some(details))
            });
        })
        .map(|(_, linked)| linked)
}

/// Spawns a note from a plan, creating bidirectional references.
///
/// The note's `date` defaults to the plan's start date. For daily plans,
/// uses `daily_note_for` relation instead of `spawned_from`.
#[tauri::command]
pub fn spawn_note_from_plan(
    state: State<'_, AppState>,
    input: SpawnNoteInput,
) -> Result<PlanLinkedNote, AppError> {
    let plan_id_for_log = input.plan_id.clone();
    state
        .db
        .with_conn(|conn| {
            let plan = read_plan(conn, &input.plan_id).map_err(to_sql_err)?;

            if plan.deleted_at.is_some() {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }

            let note_id = generate_id();
            let now = now_iso();
            let date = extract_date(&plan.start_time);
            let title = input
                .title
                .unwrap_or_else(|| plan.title.clone());
            let body = input.template_body.unwrap_or_default();

            conn.execute(
                "INSERT INTO notes (id, workspace_id, title, date, body, folder, type,
                                    category, front_matter, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, '{}', ?9, ?10)",
                rusqlite::params![
                    note_id,
                    plan.workspace_id,
                    title,
                    date,
                    body,
                    input.folder,
                    input.note_type,
                    plan.category,
                    now,
                    now,
                ],
            )?;

            // Determine relation based on plan type and note type
            let is_daily_note =
                plan.plan_type == "daily_plan" && input.note_type.as_deref() == Some("daily");
            let note_relation = if is_daily_note {
                "daily_note_for"
            } else {
                "spawned_from"
            };

            // Create bidirectional references
            let ref1_id = generate_id();
            let ref2_id = generate_id();

            // plan -> note (spawned)
            conn.execute(
                "INSERT INTO refs (id, source_type, source_id, target_type, target_id, relation, created_at)
                 VALUES (?1, 'plan', ?2, 'note', ?3, 'spawned', ?4)",
                rusqlite::params![ref1_id, input.plan_id, note_id, now],
            )?;

            // note -> plan (spawned_from or daily_note_for)
            conn.execute(
                "INSERT INTO refs (id, source_type, source_id, target_type, target_id, relation, created_at)
                 VALUES (?1, 'note', ?2, 'plan', ?3, ?4, ?5)",
                rusqlite::params![ref2_id, note_id, input.plan_id, note_relation, now],
            )?;

            Ok((plan.workspace_id.clone(), PlanLinkedNote {
                note_id,
                title: Some(title),
                date: Some(date),
                relation: "spawned".to_string(),
            }))
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "Plan".to_string(),
                    id: input.plan_id,
                }
            } else {
                AppError::Database(e)
            }
        })
        .inspect(|(wid, linked)| {
            let details = serde_json::json!({"plan_id": plan_id_for_log, "spawned": "note"});
            let _ = state.db.with_conn(|conn| {
                log_activity(conn, wid, "note", &linked.note_id, linked.title.as_deref(), "created", Some(details))
            });
        })
        .map(|(_, linked)| linked)
}

/// Links an existing task to a plan with a specified relation.
///
/// Creates a reference: task -> plan with the given relation type.
#[tauri::command]
pub fn link_task_to_plan(
    state: State<'_, AppState>,
    plan_id: String,
    task_id: String,
    relation: String,
) -> Result<(), AppError> {
    let plan_id_log = plan_id.clone();
    let task_id_log = task_id.clone();
    let relation_log = relation.clone();
    state
        .db
        .with_conn(|conn| {
            // Verify plan exists
            let plan = read_plan(conn, &plan_id).map_err(to_sql_err)?;
            if plan.deleted_at.is_some() {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }

            // Verify task exists
            let task_exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                    [&task_id],
                    |row| row.get(0),
                )?;
            if !task_exists {
                return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                    std::io::Error::other(format!("Task not found: {}", task_id)),
                )));
            }

            // Check for duplicate
            let existing: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM refs
                     WHERE source_type = 'task' AND source_id = ?1
                       AND target_type = 'plan' AND target_id = ?2
                       AND relation = ?3",
                    rusqlite::params![task_id, plan_id, relation],
                    |row| row.get(0),
                )?;

            if existing {
                return Ok(plan.workspace_id.clone()); // Idempotent
            }

            let ref_id = generate_id();
            let ref_id_reverse = generate_id();
            let now = now_iso();

            // Create bidirectional references (task → plan and plan → task)
            conn.execute(
                "INSERT INTO refs (id, source_type, source_id, target_type, target_id, relation, created_at)
                 VALUES (?1, 'task', ?2, 'plan', ?3, ?4, ?5)",
                rusqlite::params![ref_id, task_id, plan_id, relation, now],
            )?;
            conn.execute(
                "INSERT INTO refs (id, source_type, source_id, target_type, target_id, relation, created_at)
                 VALUES (?1, 'plan', ?2, 'task', ?3, ?4, ?5)",
                rusqlite::params![ref_id_reverse, plan_id, task_id, relation, now],
            )?;

            Ok(plan.workspace_id.clone())
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "Plan".to_string(),
                    id: plan_id,
                }
            } else {
                AppError::Database(e)
            }
        })
        .inspect(|wid| {
            let details = serde_json::json!({"plan_id": plan_id_log, "task_id": task_id_log, "relation": relation_log});
            let _ = state.db.with_conn(|conn| {
                log_activity(conn, wid, "plan", &plan_id_log, None, "linked", Some(details))
            });
        })
        .map(|_| ())
}

/// Removes all references between a task and a plan.
#[tauri::command]
pub fn unlink_task_from_plan(
    state: State<'_, AppState>,
    plan_id: String,
    task_id: String,
) -> Result<(), AppError> {
    let plan_id_log = plan_id.clone();
    let task_id_log = task_id.clone();

    // Capture workspace_id before deletion
    let workspace_id: Option<String> = state.db.with_conn(|conn| {
        conn.query_row(
            "SELECT workspace_id FROM plans WHERE id = ?1",
            [&plan_id_log],
            |row| row.get(0),
        ).ok().map_or(Ok(None), |v| Ok(Some(v)))
    }).ok().flatten();

    state
        .db
        .with_conn(|conn| {
            // Delete task -> plan references
            conn.execute(
                "DELETE FROM refs
                 WHERE source_type = 'task' AND source_id = ?1
                   AND target_type = 'plan' AND target_id = ?2",
                rusqlite::params![task_id, plan_id],
            )?;

            // Delete plan -> task references
            conn.execute(
                "DELETE FROM refs
                 WHERE source_type = 'plan' AND source_id = ?1
                   AND target_type = 'task' AND target_id = ?2",
                rusqlite::params![plan_id, task_id],
            )?;

            Ok(())
        })
        .map_err(AppError::Database)?;

    // Best-effort activity logging
    if let Some(wid) = workspace_id {
        let details = serde_json::json!({"plan_id": plan_id_log, "task_id": task_id_log});
        let _ = state.db.with_conn(|conn| {
            log_activity(conn, &wid, "plan", &plan_id_log, None, "unlinked", Some(details))
        });
    }

    Ok(())
}

/// Searches plans using FTS5 full-text search.
///
/// Searches title, description, tags, and category fields.
/// Excludes soft-deleted plans.
#[tauri::command]
pub fn search_plans(
    state: State<'_, AppState>,
    workspace_id: String,
    query: String,
) -> Result<Vec<Plan>, AppError> {
    let sanitized = sanitize_fts_query(&query);

    state
        .db
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT p.id, p.workspace_id, p.title, p.description,
                        p.start_time, p.end_time, p.all_day, p.type,
                        p.category, p.color, p.importance,
                        p.tags, p.recurrence, p.created_at, p.updated_at, p.deleted_at
                 FROM plans_fts
                 JOIN plans p ON plans_fts.rowid = p.rowid
                 WHERE plans_fts MATCH ?1 AND p.workspace_id = ?2 AND p.deleted_at IS NULL
                 ORDER BY rank
                 LIMIT 50",
            )?;

            let plans = stmt
                .query_map(rusqlite::params![sanitized, workspace_id], |row| {
                    let tags_str: Option<String> = row.get(11)?;
                    let tags = tags_str
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok());
                    let recurrence_str: Option<String> = row.get(12)?;
                    let recurrence = recurrence_str
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok());

                    Ok(Plan {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        title: row.get(2)?,
                        description: row.get(3)?,
                        start_time: row.get(4)?,
                        end_time: row.get(5)?,
                        all_day: row.get(6)?,
                        plan_type: row.get(7)?,
                        category: row.get(8)?,
                        color: row.get(9)?,
                        importance: row.get(10)?,
                        tags,
                        recurrence,
                        created_at: row.get(13)?,
                        updated_at: row.get(14)?,
                        deleted_at: row.get(15)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(plans)
        })
        .map_err(AppError::Database)
}

/// Gets a unified agenda of plans and scheduled tasks in chronological order.
#[tauri::command]
pub fn get_agenda(
    state: State<'_, AppState>,
    workspace_id: String,
    start_date: String,
    end_date: String,
) -> Result<Vec<AgendaItem>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut items: Vec<AgendaItem> = Vec::new();

            // Get plans in date range
            let mut plan_stmt = conn.prepare(
                "SELECT id, title, start_time, end_time, all_day, type, color, importance
                 FROM plans
                 WHERE workspace_id = ?1
                   AND deleted_at IS NULL
                   AND start_time < ?3
                   AND end_time > ?2
                 ORDER BY start_time ASC",
            )?;

            let plan_items: Vec<AgendaItem> = plan_stmt
                .query_map(rusqlite::params![workspace_id, start_date, end_date], |row| {
                    Ok(AgendaItem {
                        item_type: "plan".to_string(),
                        id: row.get(0)?,
                        title: row.get(1)?,
                        start_time: row.get(2)?,
                        end_time: row.get(3)?,
                        date: None,
                        plan_type: row.get(5)?,
                        task_status: None,
                        task_priority: None,
                        color: row.get(6)?,
                        importance: row.get(7)?,
                        all_day: row.get(4)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            items.extend(plan_items);

            // Get tasks with scheduled_date or due_date in range
            let mut task_stmt = conn.prepare(
                "SELECT id, title, status, priority, scheduled_date, due_date, color
                 FROM tasks
                 WHERE workspace_id = ?1
                   AND deleted_at IS NULL
                   AND status NOT IN ('done', 'cancelled')
                   AND (
                       (scheduled_date >= ?2 AND scheduled_date < ?3)
                       OR (due_date >= ?2 AND due_date < ?3)
                   )
                 ORDER BY COALESCE(scheduled_date, due_date) ASC",
            )?;

            let task_items: Vec<AgendaItem> = task_stmt
                .query_map(rusqlite::params![workspace_id, start_date, end_date], |row| {
                    let scheduled: Option<String> = row.get(4)?;
                    let due: Option<String> = row.get(5)?;
                    let date = scheduled.or(due);

                    Ok(AgendaItem {
                        item_type: "task".to_string(),
                        id: row.get(0)?,
                        title: row.get(1)?,
                        start_time: None,
                        end_time: None,
                        date,
                        plan_type: None,
                        task_status: row.get(2)?,
                        task_priority: row.get(3)?,
                        color: row.get(6)?,
                        importance: None,
                        all_day: None,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            items.extend(task_items);

            // Sort by datetime: plans by start_time, tasks by date
            items.sort_by(|a, b| {
                let a_time = a
                    .start_time
                    .as_deref()
                    .or(a.date.as_deref())
                    .unwrap_or("");
                let b_time = b
                    .start_time
                    .as_deref()
                    .or(b.date.as_deref())
                    .unwrap_or("");
                a_time.cmp(b_time)
            });

            Ok(items)
        })
        .map_err(AppError::Database)
}
