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

#[cfg(test)]
mod tests {
    use super::*;

    // --- compute_diff pure tests ---
    #[test]
    fn diff_identical() {
        let (_hunks, stats) = compute_diff("hello\n", "hello\n");
        assert_eq!(stats.additions, 0);
        assert_eq!(stats.deletions, 0);
        assert_eq!(stats.unchanged, 1);
    }

    #[test]
    fn diff_addition() {
        let (_hunks, stats) = compute_diff("line1\n", "line1\nline2\n");
        assert_eq!(stats.additions, 1);
        assert_eq!(stats.deletions, 0);
    }

    #[test]
    fn diff_deletion() {
        let (_hunks, stats) = compute_diff("line1\nline2\n", "line1\n");
        assert_eq!(stats.deletions, 1);
        assert_eq!(stats.additions, 0);
    }

    #[test]
    fn diff_replacement() {
        let (_hunks, stats) = compute_diff("old\n", "new\n");
        assert!(stats.additions >= 1);
        assert!(stats.deletions >= 1);
    }

    #[test]
    fn diff_empty_to_content() {
        let (_hunks, stats) = compute_diff("", "hello\n");
        assert_eq!(stats.additions, 1);
        assert_eq!(stats.deletions, 0);
    }

    #[test]
    fn diff_content_to_empty() {
        let (_hunks, stats) = compute_diff("hello\n", "");
        assert_eq!(stats.deletions, 1);
        assert_eq!(stats.additions, 0);
    }

    #[test]
    fn diff_multiline_change() {
        let old = "line1\nline2\nline3\n";
        let new = "line1\nmodified\nline3\n";
        let (_hunks, stats) = compute_diff(old, new);
        assert!(stats.additions >= 1);
        assert!(stats.deletions >= 1);
        assert!(stats.unchanged >= 2);
    }

    // --- compute_hash ---
    #[test]
    fn hash_deterministic() {
        let h1 = compute_hash("test content");
        let h2 = compute_hash("test content");
        assert_eq!(h1, h2);
    }

    #[test]
    fn hash_different_for_different_content() {
        assert_ne!(compute_hash("aaa"), compute_hash("bbb"));
    }

    // --- DB integration tests ---
    #[test]
    fn snapshot_creates_version() {
        let conn = crate::test_helpers::test_db();
        let note_id = crate::test_helpers::insert_test_note(&conn, "Test", "body");
        let v = snapshot_note(&conn, &note_id, crate::test_helpers::TEST_WS_ID, Some("Test"), "body v1", 50).unwrap();
        assert!(v.is_some());
        let v = v.unwrap();
        assert_eq!(v.version_number, 1);
    }

    #[test]
    fn snapshot_deduplicates() {
        let conn = crate::test_helpers::test_db();
        let note_id = crate::test_helpers::insert_test_note(&conn, "Test", "body");
        snapshot_note(&conn, &note_id, crate::test_helpers::TEST_WS_ID, Some("Test"), "same body", 50).unwrap();
        let v2 = snapshot_note(&conn, &note_id, crate::test_helpers::TEST_WS_ID, Some("Test"), "same body", 50).unwrap();
        assert!(v2.is_none()); // duplicate, skipped
    }

    #[test]
    fn snapshot_increments_version() {
        let conn = crate::test_helpers::test_db();
        let note_id = crate::test_helpers::insert_test_note(&conn, "Test", "body");
        snapshot_note(&conn, &note_id, crate::test_helpers::TEST_WS_ID, Some("Test"), "v1", 50).unwrap();
        let v2 = snapshot_note(&conn, &note_id, crate::test_helpers::TEST_WS_ID, Some("Test"), "v2", 50).unwrap();
        assert_eq!(v2.unwrap().version_number, 2);
    }

    #[test]
    fn list_versions_ordered() {
        let conn = crate::test_helpers::test_db();
        let note_id = crate::test_helpers::insert_test_note(&conn, "Test", "body");
        snapshot_note(&conn, &note_id, crate::test_helpers::TEST_WS_ID, Some("T"), "v1", 50).unwrap();
        snapshot_note(&conn, &note_id, crate::test_helpers::TEST_WS_ID, Some("T"), "v2", 50).unwrap();
        let versions = list_versions(&conn, &note_id).unwrap();
        assert_eq!(versions.len(), 2);
        assert!(versions[0].version_number > versions[1].version_number); // DESC order
    }

    #[test]
    fn get_version_by_id() {
        let conn = crate::test_helpers::test_db();
        let note_id = crate::test_helpers::insert_test_note(&conn, "Test", "body");
        let v = snapshot_note(&conn, &note_id, crate::test_helpers::TEST_WS_ID, Some("T"), "content", 50).unwrap().unwrap();
        let fetched = get_version(&conn, &v.id).unwrap();
        assert_eq!(fetched.body, "content");
    }

    #[test]
    fn auto_prune_limits_versions() {
        let conn = crate::test_helpers::test_db();
        let note_id = crate::test_helpers::insert_test_note(&conn, "Test", "body");
        for i in 0..5 {
            snapshot_note(&conn, &note_id, crate::test_helpers::TEST_WS_ID, Some("T"), &format!("v{}", i), 3).unwrap();
        }
        let versions = list_versions(&conn, &note_id).unwrap();
        assert_eq!(versions.len(), 3);
    }

    #[test]
    fn storage_stats() {
        let conn = crate::test_helpers::test_db();
        let note_id = crate::test_helpers::insert_test_note(&conn, "Test", "body");
        snapshot_note(&conn, &note_id, crate::test_helpers::TEST_WS_ID, Some("T"), "content", 50).unwrap();
        let stats = get_storage_stats(&conn, crate::test_helpers::TEST_WS_ID).unwrap();
        assert_eq!(stats.total_versions, 1);
        assert_eq!(stats.notes_with_versions, 1);
        assert!(stats.total_size_bytes > 0);
    }
}
