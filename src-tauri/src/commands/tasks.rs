use crate::models::task::{
    CreateTask, Task, TaskFilter, TaskSort, TaskWithChildren, UpdateTask, VALID_PRIORITIES,
    VALID_STATUSES,
};
use crate::models::undo::{OperationType, UndoEntityType, UndoableOperation};
use crate::services::activity::log_activity;
use crate::services::references::{get_task_depth, would_create_cycle};
use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::{id::generate_id, time::now_iso};
use tauri::State;

/// Reads a single task row from the database into a `Task` struct.
fn read_task(conn: &rusqlite::Connection, id: &str) -> Result<Task, AppError> {
    let task = conn.query_row(
        "SELECT id, workspace_id, title, description, status, priority,
                due_date, scheduled_date, completed_at, category, color,
                tags, estimated_mins, actual_mins, recurrence,
                parent_task_id, is_sticky, created_at, updated_at, deleted_at
         FROM tasks WHERE id = ?1",
        [id],
        |row| {
            let tags_str: Option<String> = row.get(11)?;
            let tags = tags_str
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok());

            let recurrence_str: Option<String> = row.get(14)?;
            let recurrence = recurrence_str
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok());

            Ok(Task {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                status: row.get(4)?,
                priority: row.get(5)?,
                due_date: row.get(6)?,
                scheduled_date: row.get(7)?,
                completed_at: row.get(8)?,
                category: row.get(9)?,
                color: row.get(10)?,
                tags,
                estimated_mins: row.get(12)?,
                actual_mins: row.get(13)?,
                recurrence,
                parent_task_id: row.get(15)?,
                is_sticky: row.get(16)?,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
                deleted_at: row.get(19)?,
            })
        },
    );

    match task {
        Ok(t) => Ok(t),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(AppError::NotFound {
            entity: "Task".to_string(),
            id: id.to_string(),
        }),
        Err(e) => Err(AppError::Database(e)),
    }
}

/// Validates that a status string is one of the allowed values.
fn validate_status(status: &str) -> Result<(), AppError> {
    if !VALID_STATUSES.contains(&status) {
        return Err(AppError::Validation(format!(
            "Invalid status '{}'. Must be one of: {}",
            status,
            VALID_STATUSES.join(", ")
        )));
    }
    Ok(())
}

/// Validates that a priority string is one of the allowed values.
fn validate_priority(priority: &str) -> Result<(), AppError> {
    if !VALID_PRIORITIES.contains(&priority) {
        return Err(AppError::Validation(format!(
            "Invalid priority '{}'. Must be one of: {}",
            priority,
            VALID_PRIORITIES.join(", ")
        )));
    }
    Ok(())
}

/// Validates that a task title is non-empty.
fn validate_title(title: &str) -> Result<(), AppError> {
    if title.trim().is_empty() {
        return Err(AppError::Validation(
            "Task title must be non-empty".to_string(),
        ));
    }
    Ok(())
}

/// Validates parent task constraints: exists, same workspace, no cycle, depth limit.
fn validate_parent(
    conn: &rusqlite::Connection,
    task_id: Option<&str>,
    parent_task_id: &str,
    workspace_id: &str,
) -> Result<(), AppError> {
    // Check parent exists and is not deleted
    let parent = read_task(conn, parent_task_id)?;
    if parent.deleted_at.is_some() {
        return Err(AppError::NotFound {
            entity: "Task".to_string(),
            id: parent_task_id.to_string(),
        });
    }

    // Check same workspace
    if parent.workspace_id != workspace_id {
        return Err(AppError::Validation(
            "Parent task must be in the same workspace".to_string(),
        ));
    }

    // Check circular reference (only relevant for updates)
    if let Some(tid) = task_id {
        if would_create_cycle(conn, tid, parent_task_id)? {
            return Err(AppError::Validation(
                "Circular subtask reference detected".to_string(),
            ));
        }
    }

    // Check depth limit: parent's depth + 1 (the new child) must be <= 10
    let parent_depth = get_task_depth(conn, parent_task_id)?;
    if parent_depth + 1 > 10 {
        return Err(AppError::Validation(
            "Maximum subtask nesting depth of 10 exceeded".to_string(),
        ));
    }

    Ok(())
}

/// Gets subtask counts for a task.
fn get_subtask_counts(conn: &rusqlite::Connection, task_id: &str) -> Result<(i64, i64), AppError> {
    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE parent_task_id = ?1 AND deleted_at IS NULL",
            [task_id],
            |row| row.get(0),
        )
        .map_err(AppError::Database)?;

    let completed: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE parent_task_id = ?1 AND deleted_at IS NULL AND status IN ('done', 'cancelled')",
            [task_id],
            |row| row.get(0),
        )
        .map_err(AppError::Database)?;

    Ok((total, completed))
}

/// Creates a new task.
///
/// Generates a UUID v7 ID, applies defaults for status ("inbox") and priority
/// ("none"), validates all inputs, and auto-sets `completed_at` if status is "done".
#[tauri::command]
pub fn create_task(state: State<'_, AppState>, task: CreateTask) -> Result<Task, AppError> {
    validate_title(&task.title)?;

    let status = task.status.as_deref().unwrap_or("inbox");
    validate_status(status)?;

    let priority = task.priority.as_deref().unwrap_or("none");
    validate_priority(priority)?;

    let id = generate_id();
    let now = now_iso();
    let completed_at = if status == "done" || status == "cancelled" {
        Some(now.clone())
    } else {
        None
    };
    let tags_json = task
        .tags
        .as_ref()
        .map(|t| serde_json::to_string(t).unwrap_or_else(|_| "[]".to_string()))
        .unwrap_or_else(|| "[]".to_string());
    let recurrence_json = task
        .recurrence
        .as_ref()
        .map(|r| serde_json::to_string(r).unwrap_or_default());
    let is_sticky = task.is_sticky.unwrap_or(false);

    state.db.with_conn(|conn| {
        // Validate parent if provided
        if let Some(ref parent_id) = task.parent_task_id {
            validate_parent(conn, None, parent_id, &task.workspace_id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                other => rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                    other.to_string(),
                ))),
            })?;
        }

        conn.execute(
            "INSERT INTO tasks (id, workspace_id, title, description, status, priority,
                                due_date, scheduled_date, completed_at, category, color,
                                tags, estimated_mins, actual_mins, recurrence,
                                parent_task_id, is_sticky, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 0, ?14, ?15, ?16, ?17, ?18)",
            rusqlite::params![
                id,
                task.workspace_id,
                task.title,
                task.description,
                status,
                priority,
                task.due_date,
                task.scheduled_date,
                completed_at,
                task.category,
                task.color,
                tags_json,
                task.estimated_mins,
                recurrence_json,
                task.parent_task_id,
                is_sticky,
                now,
                now,
            ],
        )?;

        // Auto-create default reminders if task has a due date
        if let Some(ref due_date_val) = task.due_date {
            let _ = crate::commands::reminders::create_default_reminders(
                conn, "task", &id, due_date_val, &task.workspace_id,
            );
        }

        read_task(conn, &id).map_err(|e| match e {
            AppError::Database(db_err) => db_err,
            _ => rusqlite::Error::InvalidQuery,
        })
    })
    .map_err(AppError::Database)
    .inspect(|t| {
        // Best-effort activity logging
        let _ = state.db.with_conn(|conn| {
            log_activity(conn, &t.workspace_id, "task", &t.id, Some(&t.title), "created", None)
        });
    })
}

/// Gets a single task by ID. Returns 404 if not found or soft-deleted.
#[tauri::command]
pub fn get_task(state: State<'_, AppState>, id: String) -> Result<Task, AppError> {
    state
        .db
        .with_conn(|conn| {
            let task = read_task(conn, &id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                other => rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                    other.to_string(),
                ))),
            })?;

            if task.deleted_at.is_some() {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }

            Ok(task)
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "Task".to_string(),
                    id,
                }
            } else {
                AppError::Database(e)
            }
        })
}

/// Lists tasks with filtering and sorting.
///
/// Default sort: priority DESC, then due_date ASC (nulls last), then created_at DESC.
/// Excludes soft-deleted tasks unless `include_deleted` is true.
#[tauri::command]
pub fn list_tasks(
    state: State<'_, AppState>,
    filter: TaskFilter,
    sort: Option<TaskSort>,
) -> Result<Vec<TaskWithChildren>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut sql = String::from(
                "SELECT t.id, t.workspace_id, t.title, t.description, t.status, t.priority,
                        t.due_date, t.scheduled_date, t.completed_at, t.category, t.color,
                        t.tags, t.estimated_mins, t.actual_mins, t.recurrence,
                        t.parent_task_id, t.is_sticky, t.created_at, t.updated_at, t.deleted_at
                 FROM tasks t",
            );

            // If FTS query is provided, join with tasks_fts
            let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
            let mut idx = 1u32;

            if let Some(ref fts_query) = filter.search_query {
                if !fts_query.trim().is_empty() {
                    let sanitized = sanitize_fts_query(fts_query);
                    sql = format!(
                        "SELECT t.id, t.workspace_id, t.title, t.description, t.status, t.priority,
                                t.due_date, t.scheduled_date, t.completed_at, t.category, t.color,
                                t.tags, t.estimated_mins, t.actual_mins, t.recurrence,
                                t.parent_task_id, t.is_sticky, t.created_at, t.updated_at, t.deleted_at
                         FROM tasks_fts
                         JOIN tasks t ON tasks_fts.rowid = t.rowid
                         WHERE tasks_fts MATCH ?{}",
                        idx
                    );
                    params.push(Box::new(sanitized));
                    idx += 1;
                }
            }

            // Start WHERE clause (or AND if FTS already added WHERE)
            let has_where = filter.search_query.as_ref().is_some_and(|q| !q.trim().is_empty());

            let conj = if has_where { " AND" } else { " WHERE" };
            sql.push_str(&format!("{} t.workspace_id = ?{}", conj, idx));
            params.push(Box::new(filter.workspace_id.clone()));
            idx += 1;

            // Soft-delete filter
            if !filter.include_deleted.unwrap_or(false) {
                sql.push_str(" AND t.deleted_at IS NULL");
            }

            // Status filter
            if let Some(ref statuses) = filter.status {
                if !statuses.is_empty() {
                    let placeholders: Vec<String> =
                        statuses.iter().enumerate().map(|(i, _)| format!("?{}", idx + i as u32)).collect();
                    sql.push_str(&format!(" AND t.status IN ({})", placeholders.join(", ")));
                    for s in statuses {
                        params.push(Box::new(s.clone()));
                        idx += 1;
                    }
                }
            } else if !filter.include_done.unwrap_or(false) {
                // By default, exclude done/cancelled for board views
                // Only apply when no explicit status filter is given
            }

            // Priority filter
            if let Some(ref priorities) = filter.priority {
                if !priorities.is_empty() {
                    let placeholders: Vec<String> =
                        priorities.iter().enumerate().map(|(i, _)| format!("?{}", idx + i as u32)).collect();
                    sql.push_str(&format!(" AND t.priority IN ({})", placeholders.join(", ")));
                    for p in priorities {
                        params.push(Box::new(p.clone()));
                        idx += 1;
                    }
                }
            }

            // Category filter
            if let Some(ref category) = filter.category {
                sql.push_str(&format!(" AND t.category = ?{}", idx));
                params.push(Box::new(category.clone()));
                idx += 1;
            }

            // Tag filter (JSON array contains)
            if let Some(ref tag) = filter.tag {
                sql.push_str(&format!(
                    " AND EXISTS (SELECT 1 FROM json_each(t.tags) WHERE json_each.value = ?{})",
                    idx
                ));
                params.push(Box::new(tag.clone()));
                idx += 1;
            }

            // Due date range filter
            if let Some(ref due_before) = filter.due_before {
                sql.push_str(&format!(" AND t.due_date <= ?{}", idx));
                params.push(Box::new(due_before.clone()));
                idx += 1;
            }
            if let Some(ref due_after) = filter.due_after {
                sql.push_str(&format!(" AND t.due_date >= ?{}", idx));
                params.push(Box::new(due_after.clone()));
                idx += 1;
            }

            // Scheduled date filter
            if let Some(ref scheduled_date) = filter.scheduled_date {
                sql.push_str(&format!(" AND t.scheduled_date = ?{}", idx));
                params.push(Box::new(scheduled_date.clone()));
                idx += 1;
            }

            // Parent task filter
            if let Some(ref parent_opt) = filter.parent_task_id {
                match parent_opt {
                    None => {
                        // Top-level only
                        sql.push_str(" AND t.parent_task_id IS NULL");
                    }
                    Some(parent_id) => {
                        sql.push_str(&format!(" AND t.parent_task_id = ?{}", idx));
                        params.push(Box::new(parent_id.clone()));
                        idx += 1;
                    }
                }
            }

            // Sticky filter
            if let Some(is_sticky) = filter.is_sticky {
                sql.push_str(&format!(" AND t.is_sticky = ?{}", idx));
                params.push(Box::new(is_sticky as i32));
                idx += 1;
            }

            // Sorting
            if let Some(ref sort_config) = sort {
                let sort_col = match sort_config.field.as_str() {
                    "title" => "t.title",
                    "status" => "t.status",
                    "priority" => {
                        // Sort by priority order, not alphabetically
                        "CASE t.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END"
                    }
                    "due_date" => "t.due_date",
                    "created_at" => "t.created_at",
                    "updated_at" => "t.updated_at",
                    _ => "t.created_at",
                };
                let dir = if sort_config.direction == "asc" {
                    "ASC"
                } else {
                    "DESC"
                };
                // Handle nulls for due_date: nulls last for ASC, nulls first for DESC
                if sort_config.field == "due_date" {
                    if dir == "ASC" {
                        sql.push_str(&format!(" ORDER BY {} IS NULL, {} {}", sort_col, sort_col, dir));
                    } else {
                        sql.push_str(&format!(" ORDER BY {} IS NOT NULL, {} {}", sort_col, sort_col, dir));
                    }
                } else {
                    sql.push_str(&format!(" ORDER BY {} {}", sort_col, dir));
                }
            } else {
                // Default sort: priority DESC, due_date ASC (nulls last), created_at DESC
                sql.push_str(
                    " ORDER BY CASE t.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
                               t.due_date IS NULL, t.due_date ASC,
                               t.created_at DESC",
                );
            }

            // No pagination for tasks (in practice the count is manageable)
            // but add a reasonable limit
            sql.push_str(&format!(" LIMIT ?{}", idx));
            params.push(Box::new(1000i64));

            let param_refs: Vec<&dyn rusqlite::types::ToSql> =
                params.iter().map(|p| p.as_ref()).collect();

            let mut stmt = conn.prepare(&sql)?;
            let tasks = stmt
                .query_map(param_refs.as_slice(), |row| {
                    let tags_str: Option<String> = row.get(11)?;
                    let tags = tags_str
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok());

                    let recurrence_str: Option<String> = row.get(14)?;
                    let recurrence = recurrence_str
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok());

                    Ok(Task {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        title: row.get(2)?,
                        description: row.get(3)?,
                        status: row.get(4)?,
                        priority: row.get(5)?,
                        due_date: row.get(6)?,
                        scheduled_date: row.get(7)?,
                        completed_at: row.get(8)?,
                        category: row.get(9)?,
                        color: row.get(10)?,
                        tags,
                        estimated_mins: row.get(12)?,
                        actual_mins: row.get(13)?,
                        recurrence,
                        parent_task_id: row.get(15)?,
                        is_sticky: row.get(16)?,
                        created_at: row.get(17)?,
                        updated_at: row.get(18)?,
                        deleted_at: row.get(19)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            // Populate subtask counts
            let mut result = Vec::with_capacity(tasks.len());
            for task in tasks {
                let (subtask_count, completed_subtask_count) =
                    get_subtask_counts(conn, &task.id).map_err(|e| match e {
                        AppError::Database(db_err) => db_err,
                        _ => rusqlite::Error::InvalidQuery,
                    })?;
                result.push(TaskWithChildren {
                    task,
                    subtask_count,
                    completed_subtask_count,
                });
            }

            Ok(result)
        })
        .map_err(AppError::Database)
}

/// Updates a task (patch semantics). Only provided fields are updated.
///
/// Handles status transition side effects: sets `completed_at` when moving
/// to "done" or "cancelled", clears it when moving away.
#[tauri::command]
pub fn update_task(
    state: State<'_, AppState>,
    id: String,
    updates: UpdateTask,
) -> Result<Task, AppError> {
    let now = now_iso();

    // Capture previous state for undo
    if let Ok(prev_task) = state.db.with_conn(|conn| {
        read_task(conn, &id).map_err(|e| match e {
            AppError::Database(db_err) => db_err,
            _ => rusqlite::Error::InvalidQuery,
        })
    }) {
        let prev_state = serde_json::json!({
            "title": prev_task.title,
            "description": prev_task.description,
            "status": prev_task.status,
            "priority": prev_task.priority,
        });
        if let Ok(mut history) = state.operation_history.lock() {
            history.push(UndoableOperation {
                operation_type: OperationType::Update,
                entity_type: UndoEntityType::Task,
                entity_id: id.clone(),
                previous_state: prev_state,
                description: format!("Edit task: {}", prev_task.title),
                timestamp: now.clone(),
            });
        }
    }

    state.db.with_conn(|conn| {
        // Verify task exists and is not deleted
        let existing = read_task(conn, &id).map_err(|e| match e {
            AppError::Database(db_err) => db_err,
            other => rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                other.to_string(),
            ))),
        })?;

        if existing.deleted_at.is_some() {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        // Validate fields
        if let Some(ref title) = updates.title {
            validate_title(title).map_err(|e| {
                rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                    e.to_string(),
                )))
            })?;
        }

        if let Some(ref status) = updates.status {
            validate_status(status).map_err(|e| {
                rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                    e.to_string(),
                )))
            })?;
        }

        if let Some(ref priority) = updates.priority {
            validate_priority(priority).map_err(|e| {
                rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                    e.to_string(),
                )))
            })?;
        }

        // Validate parent if changing
        if let Some(Some(ref parent_id)) = updates.parent_task_id {
            validate_parent(conn, Some(&id), parent_id, &existing.workspace_id).map_err(
                |e| {
                    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                        e.to_string(),
                    )))
                },
            )?;
        }

        // Build dynamic UPDATE
        let mut set_clauses = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        let mut pidx = 1u32;

        if let Some(ref title) = updates.title {
            set_clauses.push(format!("title = ?{}", pidx));
            params.push(Box::new(title.clone()));
            pidx += 1;
        }
        if let Some(ref desc_opt) = updates.description {
            set_clauses.push(format!("description = ?{}", pidx));
            params.push(Box::new(desc_opt.clone()));
            pidx += 1;
        }
        if let Some(ref status) = updates.status {
            set_clauses.push(format!("status = ?{}", pidx));
            params.push(Box::new(status.clone()));
            pidx += 1;

            // Status transition side effects
            if status == "done" || status == "cancelled" {
                set_clauses.push(format!("completed_at = ?{}", pidx));
                params.push(Box::new(now.clone()));
                pidx += 1;
            } else if existing.status == "done" || existing.status == "cancelled" {
                set_clauses.push(format!("completed_at = ?{}", pidx));
                params.push(Box::new(None::<String>));
                pidx += 1;
            }
        }
        if let Some(ref priority) = updates.priority {
            set_clauses.push(format!("priority = ?{}", pidx));
            params.push(Box::new(priority.clone()));
            pidx += 1;
        }
        if let Some(ref due_opt) = updates.due_date {
            set_clauses.push(format!("due_date = ?{}", pidx));
            params.push(Box::new(due_opt.clone()));
            pidx += 1;
        }
        if let Some(ref sched_opt) = updates.scheduled_date {
            set_clauses.push(format!("scheduled_date = ?{}", pidx));
            params.push(Box::new(sched_opt.clone()));
            pidx += 1;
        }
        if let Some(ref cat_opt) = updates.category {
            set_clauses.push(format!("category = ?{}", pidx));
            params.push(Box::new(cat_opt.clone()));
            pidx += 1;
        }
        if let Some(ref color_opt) = updates.color {
            set_clauses.push(format!("color = ?{}", pidx));
            params.push(Box::new(color_opt.clone()));
            pidx += 1;
        }
        if let Some(ref tags) = updates.tags {
            let tags_json = serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string());
            set_clauses.push(format!("tags = ?{}", pidx));
            params.push(Box::new(tags_json));
            pidx += 1;
        }
        if let Some(ref est_opt) = updates.estimated_mins {
            set_clauses.push(format!("estimated_mins = ?{}", pidx));
            params.push(Box::new(*est_opt));
            pidx += 1;
        }
        if let Some(ref actual) = updates.actual_mins {
            set_clauses.push(format!("actual_mins = ?{}", pidx));
            params.push(Box::new(*actual));
            pidx += 1;
        }
        if let Some(ref rec_opt) = updates.recurrence {
            let rec_json = rec_opt
                .as_ref()
                .map(|r| serde_json::to_string(r).unwrap_or_default());
            set_clauses.push(format!("recurrence = ?{}", pidx));
            params.push(Box::new(rec_json));
            pidx += 1;
        }
        if let Some(ref parent_opt) = updates.parent_task_id {
            set_clauses.push(format!("parent_task_id = ?{}", pidx));
            params.push(Box::new(parent_opt.clone()));
            pidx += 1;
        }
        if let Some(is_sticky) = updates.is_sticky {
            set_clauses.push(format!("is_sticky = ?{}", pidx));
            params.push(Box::new(is_sticky));
            pidx += 1;
        }

        // Always update timestamp
        set_clauses.push(format!("updated_at = ?{}", pidx));
        params.push(Box::new(now));
        pidx += 1;

        let sql = format!(
            "UPDATE tasks SET {} WHERE id = ?{}",
            set_clauses.join(", "),
            pidx
        );
        params.push(Box::new(id.clone()));

        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())?;

        // Re-sync reminders if due_date changed
        if let Some(ref due_opt) = updates.due_date {
            let existing_offsets = crate::commands::reminders::get_unfired_offsets(
                conn, "task", &id,
            ).unwrap_or_default();
            let _ = crate::commands::reminders::delete_unfired_reminders_for_entity(
                conn, "task", &id,
            );
            if let Some(ref new_due) = due_opt {
                if existing_offsets.is_empty() {
                    let _ = crate::commands::reminders::create_default_reminders(
                        conn, "task", &id, new_due, &existing.workspace_id,
                    );
                } else {
                    let _ = crate::commands::reminders::recreate_reminders_with_offsets(
                        conn, "task", &id, new_due, &existing.workspace_id, &existing_offsets,
                    );
                }
            }
        }

        read_task(conn, &id).map_err(|e| match e {
            AppError::Database(db_err) => db_err,
            _ => rusqlite::Error::InvalidQuery,
        })
    })
    .map_err(|e| {
        if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
            AppError::NotFound {
                entity: "Task".to_string(),
                id,
            }
        } else {
            AppError::Database(e)
        }
    })
    .inspect(|t| {
        // Best-effort activity logging
        let _ = state.db.with_conn(|conn| {
            log_activity(conn, &t.workspace_id, "task", &t.id, Some(&t.title), "updated", None)
        });
    })
}

/// Soft-deletes a task. Also soft-deletes all subtasks recursively.
#[tauri::command]
pub fn delete_task(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let now = now_iso();

    // Push undo operation
    if let Ok(prev_task) = state.db.with_conn(|conn| {
        read_task(conn, &id).map_err(|e| match e {
            AppError::Database(db_err) => db_err,
            _ => rusqlite::Error::InvalidQuery,
        })
    }) {
        if let Ok(mut history) = state.operation_history.lock() {
            history.push(UndoableOperation {
                operation_type: OperationType::Delete,
                entity_type: UndoEntityType::Task,
                entity_id: id.clone(),
                previous_state: serde_json::json!({}),
                description: format!("Delete task: {}", prev_task.title),
                timestamp: now.clone(),
            });
        }
    }
    let task_meta = state
        .db
        .with_conn(|conn| {
            // Verify task exists
            let existing = read_task(conn, &id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                other => rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                    other.to_string(),
                ))),
            })?;

            if existing.deleted_at.is_some() {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }

            let meta = (existing.workspace_id.clone(), existing.title.clone());

            // Recursively soft-delete subtasks
            soft_delete_recursive(conn, &id, &now)?;

            // Delete references where this task is the source
            conn.execute(
                "DELETE FROM refs WHERE source_type = 'task' AND source_id = ?1",
                [&id],
            )?;

            // Delete all reminders for this task
            let _ = crate::commands::reminders::delete_all_reminders_for_entity(
                conn, "task", &id,
            );

            Ok(meta)
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "Task".to_string(),
                    id: id.clone(),
                }
            } else {
                AppError::Database(e)
            }
        })?;

    // Best-effort activity logging
    let _ = state.db.with_conn(|conn| {
        log_activity(conn, &task_meta.0, "task", &id, Some(&task_meta.1), "deleted", None)
    });

    Ok(())
}

/// Recursively soft-deletes a task and all its subtasks.
fn soft_delete_recursive(
    conn: &rusqlite::Connection,
    task_id: &str,
    now: &str,
) -> Result<(), rusqlite::Error> {
    // Find direct children
    let mut stmt = conn.prepare(
        "SELECT id FROM tasks WHERE parent_task_id = ?1 AND deleted_at IS NULL",
    )?;
    let child_ids: Vec<String> = stmt
        .query_map([task_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    // Recurse into children
    for child_id in &child_ids {
        soft_delete_recursive(conn, child_id, now)?;
    }

    // Soft-delete this task
    conn.execute(
        "UPDATE tasks SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        rusqlite::params![now, task_id],
    )?;

    Ok(())
}

/// Restores a soft-deleted task by clearing its `deleted_at`.
///
/// Does NOT automatically restore subtasks.
#[tauri::command]
pub fn restore_task(state: State<'_, AppState>, id: String) -> Result<Task, AppError> {
    let now = now_iso();
    let affected = state.db.with_conn(|conn| {
        conn.execute(
            "UPDATE tasks SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NOT NULL",
            rusqlite::params![now, id],
        )
    })?;

    if affected == 0 {
        return Err(AppError::NotFound {
            entity: "Task".to_string(),
            id,
        });
    }

    let task = state
        .db
        .with_conn(|conn| {
            read_task(conn, &id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })
        })
        .map_err(AppError::Database)?;

    // Best-effort activity logging
    let _ = state.db.with_conn(|conn| {
        log_activity(conn, &task.workspace_id, "task", &id, Some(&task.title), "restored", None)
    });

    Ok(task)
}

/// Toggles a task's status between todo and done.
///
/// If current status is "done", sets to "todo" and clears `completed_at`.
/// Otherwise, sets to "done" and sets `completed_at`.
#[tauri::command]
pub fn toggle_task_status(state: State<'_, AppState>, id: String) -> Result<Task, AppError> {
    let now = now_iso();
    let id_log = id.clone();

    // Push undo operation for status change
    if let Ok(prev_task) = state.db.with_conn(|conn| {
        read_task(conn, &id).map_err(|e| match e {
            AppError::Database(db_err) => db_err,
            _ => rusqlite::Error::InvalidQuery,
        })
    }) {
        let prev_state = serde_json::json!({
            "status": prev_task.status,
            "completed_at": prev_task.completed_at,
        });
        if let Ok(mut history) = state.operation_history.lock() {
            history.push(UndoableOperation {
                operation_type: OperationType::StatusChange,
                entity_type: UndoEntityType::Task,
                entity_id: id.clone(),
                previous_state: prev_state,
                description: format!("Toggle task: {}", prev_task.title),
                timestamp: now.clone(),
            });
        }
    }

    let (old_status, task) = state
        .db
        .with_conn(|conn| {
            let existing = read_task(conn, &id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                other => rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                    other.to_string(),
                ))),
            })?;

            if existing.deleted_at.is_some() {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }

            let old_status = existing.status.clone();

            if existing.status == "done" {
                conn.execute(
                    "UPDATE tasks SET status = 'todo', completed_at = NULL, updated_at = ?1 WHERE id = ?2",
                    rusqlite::params![now, id],
                )?;
            } else {
                conn.execute(
                    "UPDATE tasks SET status = 'done', completed_at = ?1, updated_at = ?1 WHERE id = ?2",
                    rusqlite::params![now, id],
                )?;
            }

            let updated = read_task(conn, &id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })?;
            Ok((old_status, updated))
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "Task".to_string(),
                    id,
                }
            } else {
                AppError::Database(e)
            }
        })?;

    // Best-effort activity logging
    let action = if task.status == "done" { "completed" } else { "status_changed" };
    let details = serde_json::json!({"field": "status", "old": old_status, "new": task.status});
    let _ = state.db.with_conn(|conn| {
        log_activity(conn, &task.workspace_id, "task", &id_log, Some(&task.title), action, Some(details))
    });

    // If task was completed and has a recurrence rule, generate next occurrence
    if task.status == "done" {
        let _ = state.db.with_conn(|conn| {
            let rule_id: Option<String> = conn
                .query_row(
                    "SELECT recurrence_rule_id FROM tasks WHERE id = ?1",
                    [&id_log],
                    |row| row.get(0),
                )
                .ok()
                .flatten();

            if let Some(rid) = rule_id {
                let rule = conn.query_row(
                    "SELECT id, workspace_id, entity_type, parent_entity_id, pattern,
                            interval, days_of_week, day_of_month, month_of_year,
                            end_date, end_after_count, occurrences_created,
                            next_occurrence_date, is_active, created_at, updated_at
                     FROM recurrence_rules WHERE id = ?1 AND is_active = 1",
                    [&rid],
                    |row| {
                        let days_str: Option<String> = row.get(6)?;
                        let days = days_str
                            .as_deref()
                            .and_then(|s| serde_json::from_str(s).ok());
                        Ok(crate::models::recurrence::RecurrenceRule {
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

                if let Ok(rule) = rule {
                    let _ = crate::commands::recurrence::generate_occurrence(conn, &rule);
                }
            }

            Ok(())
        });
    }

    Ok(task)
}

/// Gets the full subtask tree for a given task (recursive).
///
/// Returns a flat list with subtask counts for frontend tree rendering.
#[tauri::command]
pub fn get_subtask_tree(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<Vec<TaskWithChildren>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut result = Vec::new();
            collect_subtasks(conn, &task_id, &mut result)?;
            Ok(result)
        })
        .map_err(AppError::Database)
}

/// Recursively collects subtasks into a flat list.
fn collect_subtasks(
    conn: &rusqlite::Connection,
    parent_id: &str,
    result: &mut Vec<TaskWithChildren>,
) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id FROM tasks WHERE parent_task_id = ?1 AND deleted_at IS NULL ORDER BY created_at ASC",
    )?;
    let child_ids: Vec<String> = stmt
        .query_map([parent_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    for child_id in &child_ids {
        let task = read_task(conn, child_id).map_err(|e| match e {
            AppError::Database(db_err) => db_err,
            _ => rusqlite::Error::InvalidQuery,
        })?;
        let (subtask_count, completed_subtask_count) =
            get_subtask_counts(conn, child_id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })?;
        result.push(TaskWithChildren {
            task,
            subtask_count,
            completed_subtask_count,
        });
        collect_subtasks(conn, child_id, result)?;
    }

    Ok(())
}

/// Bulk update: change status for multiple tasks at once in a single transaction.
#[tauri::command]
pub fn bulk_update_task_status(
    state: State<'_, AppState>,
    task_ids: Vec<String>,
    status: String,
) -> Result<Vec<Task>, AppError> {
    validate_status(&status)?;
    if task_ids.is_empty() {
        return Ok(Vec::new());
    }

    let now = now_iso();
    let completed_at = if status == "done" || status == "cancelled" {
        Some(now.clone())
    } else {
        None
    };

    state
        .db
        .with_conn(|conn| {
            let tx = conn.unchecked_transaction()?;

            for task_id in &task_ids {
                let affected = tx.execute(
                    "UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4 AND deleted_at IS NULL",
                    rusqlite::params![status, completed_at, now, task_id],
                )?;
                if affected == 0 {
                    return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                        std::io::Error::other(format!("Task not found: {}", task_id)),
                    )));
                }
            }

            tx.commit()?;

            // Read back all updated tasks
            let mut results = Vec::with_capacity(task_ids.len());
            for task_id in &task_ids {
                let task = read_task(conn, task_id).map_err(|e| match e {
                    AppError::Database(db_err) => db_err,
                    _ => rusqlite::Error::InvalidQuery,
                })?;
                results.push(task);
            }
            Ok(results)
        })
        .map_err(AppError::Database)
        .inspect(|tasks| {
            for task in tasks {
                let details = serde_json::json!({"field": "status", "new": status});
                let _ = state.db.with_conn(|conn| {
                    log_activity(conn, &task.workspace_id, "task", &task.id, Some(&task.title), "status_changed", Some(details))
                });
            }
        })
}

/// Bulk update: add tags to multiple tasks at once. Merges new tags with existing (no duplicates).
#[tauri::command]
pub fn bulk_add_task_tags(
    state: State<'_, AppState>,
    task_ids: Vec<String>,
    tags: Vec<String>,
) -> Result<Vec<Task>, AppError> {
    if task_ids.is_empty() {
        return Ok(Vec::new());
    }

    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            let tx = conn.unchecked_transaction()?;

            for task_id in &task_ids {
                // Read current tags
                let current_tags_str: String = tx.query_row(
                    "SELECT COALESCE(tags, '[]') FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                    [task_id],
                    |row| row.get(0),
                )?;

                let mut current_tags: Vec<String> =
                    serde_json::from_str(&current_tags_str).unwrap_or_default();

                // Merge new tags (avoid duplicates)
                for tag in &tags {
                    if !current_tags.contains(tag) {
                        current_tags.push(tag.clone());
                    }
                }

                let new_tags_json =
                    serde_json::to_string(&current_tags).unwrap_or_else(|_| "[]".to_string());
                tx.execute(
                    "UPDATE tasks SET tags = ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![new_tags_json, now, task_id],
                )?;
            }

            tx.commit()?;

            // Read back all updated tasks
            let mut results = Vec::with_capacity(task_ids.len());
            for task_id in &task_ids {
                let task = read_task(conn, task_id).map_err(|e| match e {
                    AppError::Database(db_err) => db_err,
                    _ => rusqlite::Error::InvalidQuery,
                })?;
                results.push(task);
            }
            Ok(results)
        })
        .map_err(AppError::Database)
        .inspect(|tasks| {
            for task in tasks {
                let details = serde_json::json!({"field": "tags", "added": tags});
                let _ = state.db.with_conn(|conn| {
                    log_activity(conn, &task.workspace_id, "task", &task.id, Some(&task.title), "updated", Some(details))
                });
            }
        })
}

/// Bulk soft-delete multiple tasks.
#[tauri::command]
pub fn bulk_delete_tasks(
    state: State<'_, AppState>,
    task_ids: Vec<String>,
) -> Result<(), AppError> {
    if task_ids.is_empty() {
        return Ok(());
    }

    // Capture metadata before deletion for activity logging
    let metas: Vec<(String, String, String)> = task_ids.iter().filter_map(|tid| {
        state.db.with_conn(|conn| {
            conn.query_row(
                "SELECT id, workspace_id, title FROM tasks WHERE id = ?1",
                [tid],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
            ).ok().map_or(Ok(None), |v| Ok(Some(v)))
        }).ok().flatten()
    }).collect();

    let now = now_iso();

    state
        .db
        .with_conn(|conn| {
            let tx = conn.unchecked_transaction()?;

            for task_id in &task_ids {
                soft_delete_recursive(&tx, task_id, &now)?;
            }

            tx.commit()
        })
        .map_err(AppError::Database)?;

    // Best-effort activity logging
    for (tid, wid, title) in &metas {
        let _ = state.db.with_conn(|conn| {
            log_activity(conn, wid, "task", tid, Some(title.as_str()), "deleted", None)
        });
    }

    Ok(())
}

/// Gets sticky tasks for a workspace (tasks with is_sticky=1 that are not done/cancelled/deleted).
#[tauri::command]
pub fn get_sticky_tasks(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<Task>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id FROM tasks
                 WHERE workspace_id = ?1 AND is_sticky = 1
                   AND status NOT IN ('done', 'cancelled')
                   AND deleted_at IS NULL
                 ORDER BY created_at ASC",
            )?;

            let ids: Vec<String> = stmt
                .query_map([&workspace_id], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;

            let mut tasks = Vec::with_capacity(ids.len());
            for id in &ids {
                let task = read_task(conn, id).map_err(|e| match e {
                    AppError::Database(db_err) => db_err,
                    _ => rusqlite::Error::InvalidQuery,
                })?;
                tasks.push(task);
            }

            Ok(tasks)
        })
        .map_err(AppError::Database)
}

/// Moves a task to a different status (used by Kanban drag-and-drop).
///
/// Functionally equivalent to update_task with only status, but semantically
/// distinct for frontend clarity.
#[tauri::command]
pub fn move_task_status(
    state: State<'_, AppState>,
    id: String,
    new_status: String,
) -> Result<Task, AppError> {
    validate_status(&new_status)?;
    let now = now_iso();
    let id_log = id.clone();

    let (old_status, task) = state
        .db
        .with_conn(|conn| {
            let existing = read_task(conn, &id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                other => rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                    other.to_string(),
                ))),
            })?;

            if existing.deleted_at.is_some() {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }

            let old_status = existing.status.clone();

            // Handle completed_at side effects
            let completed_at = if new_status == "done" || new_status == "cancelled" {
                Some(now.clone())
            } else {
                None
            };

            conn.execute(
                "UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4",
                rusqlite::params![new_status, completed_at, now, id],
            )?;

            let updated = read_task(conn, &id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })?;
            Ok((old_status, updated))
        })
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                AppError::NotFound {
                    entity: "Task".to_string(),
                    id,
                }
            } else {
                AppError::Database(e)
            }
        })?;

    // Best-effort activity logging
    let action = if task.status == "done" { "completed" } else { "status_changed" };
    let details = serde_json::json!({"field": "status", "old": old_status, "new": task.status});
    let _ = state.db.with_conn(|conn| {
        log_activity(conn, &task.workspace_id, "task", &id_log, Some(&task.title), action, Some(details))
    });

    Ok(task)
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
