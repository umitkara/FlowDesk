use crate::models::note_version::{
    DiffHunk, DiffLine, DiffLineKind, DiffStats, NoteVersion, NoteVersionSizeEntry,
    NoteVersionSummary, VersionStorageStats,
};
use crate::utils::{id::generate_id, time::now_iso};
use rusqlite::Connection;
use sha2::{Digest, Sha256};

/// Creates a snapshot of a note's current content.
/// Deduplicates by body_hash — skips if the latest version has the same hash.
pub fn snapshot_note(
    conn: &Connection,
    note_id: &str,
    workspace_id: &str,
    title: Option<&str>,
    body: &str,
    max_versions: usize,
) -> Result<Option<NoteVersion>, rusqlite::Error> {
    let body_hash = compute_hash(body);

    // Check if latest version has the same hash
    let latest_hash: Option<String> = conn
        .query_row(
            "SELECT body_hash FROM note_versions WHERE note_id = ?1 ORDER BY version_number DESC LIMIT 1",
            [note_id],
            |row| row.get(0),
        )
        .ok();

    if latest_hash.as_deref() == Some(&body_hash) {
        return Ok(None);
    }

    // Get next version number
    let next_version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM note_versions WHERE note_id = ?1",
            [note_id],
            |row| row.get(0),
        )
        .unwrap_or(1);

    let id = generate_id();
    let now = now_iso();

    conn.execute(
        "INSERT INTO note_versions (id, note_id, workspace_id, title, body, body_hash, version_number, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, note_id, workspace_id, title, body, body_hash, next_version, now],
    )?;

    // Auto-prune if over limit
    auto_prune(conn, note_id, max_versions)?;

    Ok(Some(NoteVersion {
        id,
        note_id: note_id.to_string(),
        workspace_id: workspace_id.to_string(),
        title: title.map(String::from),
        body: body.to_string(),
        body_hash,
        version_number: next_version,
        created_at: now,
    }))
}

/// Removes oldest versions beyond the max limit for a note.
pub fn auto_prune(
    conn: &Connection,
    note_id: &str,
    max_versions: usize,
) -> Result<usize, rusqlite::Error> {
    let count: usize = conn.query_row(
        "SELECT COUNT(*) FROM note_versions WHERE note_id = ?1",
        [note_id],
        |row| row.get(0),
    )?;

    if count <= max_versions {
        return Ok(0);
    }

    let to_delete = count - max_versions;
    let deleted = conn.execute(
        "DELETE FROM note_versions WHERE id IN (
            SELECT id FROM note_versions WHERE note_id = ?1
            ORDER BY version_number ASC LIMIT ?2
        )",
        rusqlite::params![note_id, to_delete],
    )?;

    Ok(deleted)
}

/// Computes a line-level diff between two version bodies using the `similar` crate.
pub fn compute_diff(old_body: &str, new_body: &str) -> (Vec<DiffHunk>, DiffStats) {
    use similar::{ChangeTag, TextDiff};

    let diff = TextDiff::from_lines(old_body, new_body);
    let mut hunks = Vec::new();
    let mut current_hunk = DiffHunk { lines: Vec::new() };
    let mut stats = DiffStats {
        additions: 0,
        deletions: 0,
        unchanged: 0,
    };
    let mut consecutive_unchanged = 0;

    for change in diff.iter_all_changes() {
        let (kind, content) = match change.tag() {
            ChangeTag::Delete => {
                stats.deletions += 1;
                consecutive_unchanged = 0;
                (DiffLineKind::Removed, change.to_string())
            }
            ChangeTag::Insert => {
                stats.additions += 1;
                consecutive_unchanged = 0;
                (DiffLineKind::Added, change.to_string())
            }
            ChangeTag::Equal => {
                stats.unchanged += 1;
                consecutive_unchanged += 1;
                // Start a new hunk if we have too many unchanged lines in a row
                if consecutive_unchanged > 3 && !current_hunk.lines.is_empty() {
                    hunks.push(current_hunk);
                    current_hunk = DiffHunk { lines: Vec::new() };
                    continue;
                }
                (DiffLineKind::Unchanged, change.to_string())
            }
        };

        current_hunk.lines.push(DiffLine { kind, content });
    }

    if !current_hunk.lines.is_empty() {
        hunks.push(current_hunk);
    }

    (hunks, stats)
}

fn compute_hash(body: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(body.as_bytes());
    hex::encode(hasher.finalize())
}

/// Lists version summaries for a note.
pub fn list_versions(
    conn: &Connection,
    note_id: &str,
) -> Result<Vec<NoteVersionSummary>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, version_number, title, body_hash, created_at, LENGTH(body)
         FROM note_versions WHERE note_id = ?1
         ORDER BY version_number DESC",
    )?;

    let versions = stmt
        .query_map([note_id], |row| {
            Ok(NoteVersionSummary {
                id: row.get(0)?,
                version_number: row.get(1)?,
                title: row.get(2)?,
                body_hash: row.get(3)?,
                created_at: row.get(4)?,
                body_size: row.get::<_, usize>(5).unwrap_or(0),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(versions)
}

/// Gets a full version by ID.
pub fn get_version(conn: &Connection, version_id: &str) -> Result<NoteVersion, rusqlite::Error> {
    conn.query_row(
        "SELECT id, note_id, workspace_id, title, body, body_hash, version_number, created_at
         FROM note_versions WHERE id = ?1",
        [version_id],
        |row| {
            Ok(NoteVersion {
                id: row.get(0)?,
                note_id: row.get(1)?,
                workspace_id: row.get(2)?,
                title: row.get(3)?,
                body: row.get(4)?,
                body_hash: row.get(5)?,
                version_number: row.get(6)?,
                created_at: row.get(7)?,
            })
        },
    )
}

/// Gets storage stats for version history across a workspace.
pub fn get_storage_stats(
    conn: &Connection,
    workspace_id: &str,
) -> Result<VersionStorageStats, rusqlite::Error> {
    let total_versions: usize = conn.query_row(
        "SELECT COUNT(*) FROM note_versions WHERE workspace_id = ?1",
        [workspace_id],
        |row| row.get(0),
    )?;

    let total_size_bytes: usize = conn
        .query_row(
            "SELECT COALESCE(SUM(LENGTH(body)), 0) FROM note_versions WHERE workspace_id = ?1",
            [workspace_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let notes_with_versions: usize = conn.query_row(
        "SELECT COUNT(DISTINCT note_id) FROM note_versions WHERE workspace_id = ?1",
        [workspace_id],
        |row| row.get(0),
    )?;

    let mut stmt = conn.prepare(
        "SELECT nv.note_id, n.title, COUNT(*) as cnt, COALESCE(SUM(LENGTH(nv.body)), 0) as sz
         FROM note_versions nv
         LEFT JOIN notes n ON n.id = nv.note_id
         WHERE nv.workspace_id = ?1
         GROUP BY nv.note_id
         ORDER BY sz DESC
         LIMIT 10",
    )?;

    let largest_notes = stmt
        .query_map([workspace_id], |row| {
            Ok(NoteVersionSizeEntry {
                note_id: row.get(0)?,
                title: row.get(1)?,
                version_count: row.get(2)?,
                total_size_bytes: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(VersionStorageStats {
        total_versions,
        total_size_bytes,
        notes_with_versions,
        largest_notes,
    })
}
