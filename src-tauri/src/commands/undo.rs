use crate::models::undo::{OperationType, UndoEntityType, UndoRedoState};
use crate::state::AppState;
use crate::utils::errors::AppError;
use tauri::{Emitter, State};

/// Undoes the most recent operation.
#[tauri::command]
pub fn undo_operation(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<UndoRedoState, AppError> {
    let op = {
        let mut history = state
            .operation_history
            .lock()
            .map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
        history.undo()
    };

    if let Some(op) = op {
        match op.entity_type {
            UndoEntityType::Note => {
                let prev = &op.previous_state;
                match op.operation_type {
                    OperationType::Update => {
                        let title = prev.get("title").and_then(|v| v.as_str());
                        let body = prev.get("body").and_then(|v| v.as_str());
                        let body_hash = prev.get("body_hash").and_then(|v| v.as_str());

                        state.db.with_conn(|conn| {
                            if let (Some(body), Some(hash)) = (body, body_hash) {
                                conn.execute(
                                    "UPDATE notes SET title = ?1, body = ?2, body_hash = ?3, updated_at = ?4 WHERE id = ?5",
                                    rusqlite::params![title, body, hash, crate::utils::time::now_iso(), op.entity_id],
                                )?;
                            }
                            Ok(())
                        }).map_err(AppError::Database)?;
                    }
                    OperationType::Delete => {
                        state.db.with_conn(|conn| {
                            conn.execute(
                                "UPDATE notes SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2",
                                rusqlite::params![crate::utils::time::now_iso(), op.entity_id],
                            )?;
                            Ok(())
                        }).map_err(AppError::Database)?;
                    }
                    OperationType::StatusChange => {}
                }
            }
            UndoEntityType::Task => {
                let prev = &op.previous_state;
                match op.operation_type {
                    OperationType::Update => {
                        let title = prev.get("title").and_then(|v| v.as_str());
                        let description = prev.get("description").and_then(|v| v.as_str());
                        let status = prev.get("status").and_then(|v| v.as_str());
                        let priority = prev.get("priority").and_then(|v| v.as_str());

                        state.db.with_conn(|conn| {
                            conn.execute(
                                "UPDATE tasks SET title = ?1, description = ?2, status = ?3, priority = ?4, updated_at = ?5 WHERE id = ?6",
                                rusqlite::params![title, description, status, priority, crate::utils::time::now_iso(), op.entity_id],
                            )?;
                            Ok(())
                        }).map_err(AppError::Database)?;
                    }
                    OperationType::Delete => {
                        state.db.with_conn(|conn| {
                            conn.execute(
                                "UPDATE tasks SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2",
                                rusqlite::params![crate::utils::time::now_iso(), op.entity_id],
                            )?;
                            Ok(())
                        }).map_err(AppError::Database)?;
                    }
                    OperationType::StatusChange => {
                        let status = prev.get("status").and_then(|v| v.as_str());
                        let completed_at = prev.get("completed_at");

                        state.db.with_conn(|conn| {
                            conn.execute(
                                "UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4",
                                rusqlite::params![
                                    status,
                                    completed_at.and_then(|v| v.as_str()),
                                    crate::utils::time::now_iso(),
                                    op.entity_id,
                                ],
                            )?;
                            Ok(())
                        }).map_err(AppError::Database)?;
                    }
                }
            }
        }
    }

    let history = state
        .operation_history
        .lock()
        .map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
    let result = history.state();
    drop(history);
    let _ = app.emit("undo-state-changed", &result);
    Ok(result)
}

/// Redoes the most recently undone operation.
#[tauri::command]
pub fn redo_operation(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<UndoRedoState, AppError> {
    let op = {
        let mut history = state
            .operation_history
            .lock()
            .map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
        history.redo()
    };

    if let Some(op) = op {
        match op.entity_type {
            UndoEntityType::Note => {
                let after = &op.after_state;
                match op.operation_type {
                    OperationType::Update => {
                        let title = after.get("title").and_then(|v| v.as_str());
                        let body = after.get("body").and_then(|v| v.as_str());
                        let body_hash = after.get("body_hash").and_then(|v| v.as_str());
                        state.db.with_conn(|conn| {
                            if let (Some(body), Some(hash)) = (body, body_hash) {
                                conn.execute(
                                    "UPDATE notes SET title = ?1, body = ?2, body_hash = ?3, updated_at = ?4 WHERE id = ?5",
                                    rusqlite::params![title, body, hash, crate::utils::time::now_iso(), op.entity_id],
                                )?;
                            }
                            Ok(())
                        }).map_err(AppError::Database)?;
                    }
                    OperationType::Delete => {
                        state.db.with_conn(|conn| {
                            conn.execute(
                                "UPDATE notes SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
                                rusqlite::params![crate::utils::time::now_iso(), op.entity_id],
                            )?;
                            Ok(())
                        }).map_err(AppError::Database)?;
                    }
                    OperationType::StatusChange => {}
                }
            }
            UndoEntityType::Task => {
                let after = &op.after_state;
                match op.operation_type {
                    OperationType::Update => {
                        let title = after.get("title").and_then(|v| v.as_str());
                        let description = after.get("description").and_then(|v| v.as_str());
                        let status = after.get("status").and_then(|v| v.as_str());
                        let priority = after.get("priority").and_then(|v| v.as_str());
                        state.db.with_conn(|conn| {
                            conn.execute(
                                "UPDATE tasks SET title = ?1, description = ?2, status = ?3, priority = ?4, updated_at = ?5 WHERE id = ?6",
                                rusqlite::params![title, description, status, priority, crate::utils::time::now_iso(), op.entity_id],
                            )?;
                            Ok(())
                        }).map_err(AppError::Database)?;
                    }
                    OperationType::Delete => {
                        state.db.with_conn(|conn| {
                            conn.execute(
                                "UPDATE tasks SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
                                rusqlite::params![crate::utils::time::now_iso(), op.entity_id],
                            )?;
                            Ok(())
                        }).map_err(AppError::Database)?;
                    }
                    OperationType::StatusChange => {
                        let status = after.get("status").and_then(|v| v.as_str());
                        let completed_at = after.get("completed_at");
                        state.db.with_conn(|conn| {
                            conn.execute(
                                "UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4",
                                rusqlite::params![
                                    status,
                                    completed_at.and_then(|v| v.as_str()),
                                    crate::utils::time::now_iso(),
                                    op.entity_id,
                                ],
                            )?;
                            Ok(())
                        }).map_err(AppError::Database)?;
                    }
                }
            }
        }
    }

    let history = state
        .operation_history
        .lock()
        .map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
    let result = history.state();
    drop(history);
    let _ = app.emit("undo-state-changed", &result);
    Ok(result)
}

/// Gets the current undo/redo state.
#[tauri::command]
pub fn get_undo_redo_state(state: State<'_, AppState>) -> Result<UndoRedoState, AppError> {
    let history = state
        .operation_history
        .lock()
        .map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
    Ok(history.state())
}
