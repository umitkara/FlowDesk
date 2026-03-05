use crate::utils::id::generate_id;
use crate::utils::time::now_iso;
use rusqlite::Connection;

/// Logs an activity entry to the activity_log table.
///
/// Called from entity mutation commands (create, update, delete, status_change)
/// to build a chronological audit trail for the timeline view.
/// Returns `rusqlite::Error` to be compatible with `DbPool::with_conn`.
pub fn log_activity(
    conn: &Connection,
    workspace_id: &str,
    entity_type: &str,
    entity_id: &str,
    entity_title: Option<&str>,
    action: &str,
    details: Option<serde_json::Value>,
) -> Result<(), rusqlite::Error> {
    let id = generate_id();
    let now = now_iso();
    let details_str = details.map(|d| d.to_string());

    conn.execute(
        "INSERT INTO activity_log (id, workspace_id, entity_type, entity_id, entity_title, action, details, actor, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'user', ?8)",
        rusqlite::params![
            id,
            workspace_id,
            entity_type,
            entity_id,
            entity_title,
            action,
            details_str,
            now,
        ],
    )?;

    Ok(())
}
