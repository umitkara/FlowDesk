use crate::models::note_version::{
    NoteVersion, NoteVersionSummary, PruneResult, VersionDiff, VersionHistoryConfig,
    VersionStorageStats,
};
use crate::services::versions;
use crate::state::AppState;
use crate::utils::errors::AppError;
use tauri::State;

fn get_config(state: &AppState) -> VersionHistoryConfig {
    state
        .db
        .with_conn(|conn| {
            let json: String = conn
                .query_row(
                    "SELECT value FROM settings WHERE key = 'version_history'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or_default();
            Ok(serde_json::from_str(&json).unwrap_or_default())
        })
        .unwrap_or_default()
}

/// Creates a version snapshot of a note's current state.
#[tauri::command]
pub fn create_version(
    state: State<'_, AppState>,
    note_id: String,
    workspace_id: String,
    title: Option<String>,
    body: String,
) -> Result<Option<NoteVersion>, AppError> {
    let config = get_config(&state);
    if !config.enabled {
        return Ok(None);
    }

    state
        .db
        .with_conn(|conn| {
            versions::snapshot_note(
                conn,
                &note_id,
                &workspace_id,
                title.as_deref(),
                &body,
                config.max_versions_per_note,
            )
        })
        .map_err(AppError::Database)
}

/// Lists version summaries for a note.
#[tauri::command]
pub fn list_versions(
    state: State<'_, AppState>,
    note_id: String,
) -> Result<Vec<NoteVersionSummary>, AppError> {
    state
        .db
        .with_conn(|conn| versions::list_versions(conn, &note_id))
        .map_err(AppError::Database)
}

/// Gets a full version by ID.
#[tauri::command]
pub fn get_version(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<NoteVersion, AppError> {
    state
        .db
        .with_conn(|conn| versions::get_version(conn, &version_id))
        .map_err(AppError::Database)
}

/// Restores a note to a specific version.
#[tauri::command]
pub fn restore_version(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<NoteVersion, AppError> {
    let version = state
        .db
        .with_conn(|conn| versions::get_version(conn, &version_id))
        .map_err(AppError::Database)?;

    let now = crate::utils::time::now_iso();

    // Update the note with the version's content
    state
        .db
        .with_conn(|conn| {
            conn.execute(
                "UPDATE notes SET title = ?1, body = ?2, body_hash = ?3, updated_at = ?4 WHERE id = ?5",
                rusqlite::params![version.title, version.body, version.body_hash, now, version.note_id],
            )?;
            Ok(())
        })
        .map_err(AppError::Database)?;

    // Create a new version snapshot for the restore
    let config = get_config(&state);
    let _ = state.db.with_conn(|conn| {
        versions::snapshot_note(
            conn,
            &version.note_id,
            &version.workspace_id,
            version.title.as_deref(),
            &version.body,
            config.max_versions_per_note,
        )
    });

    Ok(version)
}

/// Deletes a specific version.
#[tauri::command]
pub fn delete_version(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<(), AppError> {
    let affected = state
        .db
        .with_conn(|conn| {
            conn.execute("DELETE FROM note_versions WHERE id = ?1", [&version_id])
        })
        .map_err(AppError::Database)?;

    if affected == 0 {
        return Err(AppError::NotFound {
            entity: "NoteVersion".to_string(),
            id: version_id,
        });
    }

    Ok(())
}

/// Prunes old versions for a note down to max_keep.
#[tauri::command]
pub fn prune_versions(
    state: State<'_, AppState>,
    note_id: String,
    max_keep: Option<usize>,
) -> Result<PruneResult, AppError> {
    let config = get_config(&state);
    let limit = max_keep.unwrap_or(config.max_versions_per_note);

    let pruned_count = state
        .db
        .with_conn(|conn| versions::auto_prune(conn, &note_id, limit))
        .map_err(AppError::Database)?;

    Ok(PruneResult {
        pruned_count,
        freed_bytes: 0, // Approximate; SQLite reclaims space lazily
    })
}

/// Gets storage statistics for version history.
#[tauri::command]
pub fn get_version_storage_stats(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<VersionStorageStats, AppError> {
    state
        .db
        .with_conn(|conn| versions::get_storage_stats(conn, &workspace_id))
        .map_err(AppError::Database)
}

/// Computes a diff between two versions.
#[tauri::command]
pub fn diff_versions(
    state: State<'_, AppState>,
    from_version_id: String,
    to_version_id: String,
) -> Result<VersionDiff, AppError> {
    let from = state
        .db
        .with_conn(|conn| versions::get_version(conn, &from_version_id))
        .map_err(AppError::Database)?;

    let to = state
        .db
        .with_conn(|conn| versions::get_version(conn, &to_version_id))
        .map_err(AppError::Database)?;

    let (hunks, stats) = versions::compute_diff(&from.body, &to.body);

    Ok(VersionDiff {
        from_version_id,
        to_version_id,
        hunks,
        stats,
    })
}
