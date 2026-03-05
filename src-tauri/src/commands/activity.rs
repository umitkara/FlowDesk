use crate::models::discovery::{ActivityEntry, ActivityQuery};
use crate::state::AppState;
use crate::utils::errors::AppError;
use tauri::State;

/// Queries the activity log with optional filters.
///
/// Supports filtering by entity type, entity ID, action, and date range.
/// Results are ordered by created_at descending (newest first).
#[tauri::command]
pub fn list_activity(
    state: State<'_, AppState>,
    query: ActivityQuery,
) -> Result<Vec<ActivityEntry>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut sql = String::from(
                "SELECT id, workspace_id, entity_type, entity_id, entity_title, action, details, actor, created_at
                 FROM activity_log
                 WHERE workspace_id = ?1",
            );
            let mut params: Vec<Box<dyn rusqlite::types::ToSql>> =
                vec![Box::new(query.workspace_id.clone())];

            if let Some(ref et) = query.entity_type {
                params.push(Box::new(et.clone()));
                sql.push_str(&format!(" AND entity_type = ?{}", params.len()));
            }

            if let Some(ref eid) = query.entity_id {
                params.push(Box::new(eid.clone()));
                sql.push_str(&format!(" AND entity_id = ?{}", params.len()));
            }

            if let Some(ref action) = query.action {
                params.push(Box::new(action.clone()));
                sql.push_str(&format!(" AND action = ?{}", params.len()));
            }

            if let Some(ref date_from) = query.date_from {
                params.push(Box::new(date_from.clone()));
                sql.push_str(&format!(" AND created_at >= ?{}", params.len()));
            }

            if let Some(ref date_to) = query.date_to {
                params.push(Box::new(date_to.clone()));
                sql.push_str(&format!(" AND created_at <= ?{}", params.len()));
            }

            sql.push_str(" ORDER BY created_at DESC");

            let limit = query.limit.unwrap_or(50);
            let offset = query.offset.unwrap_or(0);
            params.push(Box::new(limit));
            sql.push_str(&format!(" LIMIT ?{}", params.len()));
            params.push(Box::new(offset));
            sql.push_str(&format!(" OFFSET ?{}", params.len()));

            let mut stmt = conn.prepare(&sql)?;
            let param_refs: Vec<&dyn rusqlite::types::ToSql> =
                params.iter().map(|p| p.as_ref()).collect();

            let entries = stmt
                .query_map(param_refs.as_slice(), |row| {
                    let details_str: Option<String> = row.get(6)?;
                    let details = details_str
                        .and_then(|s| serde_json::from_str(&s).ok());

                    Ok(ActivityEntry {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        entity_type: row.get(2)?,
                        entity_id: row.get(3)?,
                        entity_title: row.get(4)?,
                        action: row.get(5)?,
                        details,
                        actor: row.get(7)?,
                        created_at: row.get(8)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(entries)
        })
        .map_err(AppError::Database)
}

/// Gets activity entries for a specific entity.
///
/// Returns the most recent activity for the given entity type and ID.
#[tauri::command]
pub fn get_entity_activity(
    state: State<'_, AppState>,
    entity_type: String,
    entity_id: String,
    limit: Option<i64>,
) -> Result<Vec<ActivityEntry>, AppError> {
    let limit = limit.unwrap_or(20);

    state
        .db
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_id, entity_type, entity_id, entity_title, action, details, actor, created_at
                 FROM activity_log
                 WHERE entity_type = ?1 AND entity_id = ?2
                 ORDER BY created_at DESC
                 LIMIT ?3",
            )?;

            let entries = stmt
                .query_map(rusqlite::params![entity_type, entity_id, limit], |row| {
                    let details_str: Option<String> = row.get(6)?;
                    let details = details_str
                        .and_then(|s| serde_json::from_str(&s).ok());

                    Ok(ActivityEntry {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        entity_type: row.get(2)?,
                        entity_id: row.get(3)?,
                        entity_title: row.get(4)?,
                        action: row.get(5)?,
                        details,
                        actor: row.get(7)?,
                        created_at: row.get(8)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(entries)
        })
        .map_err(AppError::Database)
}
