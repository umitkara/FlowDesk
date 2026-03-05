use rusqlite::Connection;

/// Runs all pending database migrations in order.
///
/// Creates a `_migrations` tracking table on first run. Each migration
/// is applied at most once, identified by its version number. This makes
/// the operation idempotent — safe to call on every app startup.
pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )",
        [],
    )?;

    let migrations = vec![
        (
            1,
            "001_initial_schema",
            include_str!("../../migrations/001_initial_schema.sql"),
        ),
        (
            2,
            "002_tags_workspace",
            include_str!("../../migrations/002_tags_workspace.sql"),
        ),
        (
            3,
            "003_note_fields",
            include_str!("../../migrations/003_note_fields.sql"),
        ),
        (
            4,
            "004_tasks",
            include_str!("../../migrations/004_tasks.sql"),
        ),
        (
            5,
            "005_references",
            include_str!("../../migrations/005_references.sql"),
        ),
        (
            6,
            "006_plans",
            include_str!("../../migrations/006_plans.sql"),
        ),
        (
            7,
            "007_time_entries",
            include_str!("../../migrations/007_time_entries.sql"),
        ),
        (
            8,
            "008_workspaces_enhanced",
            include_str!("../../migrations/008_workspaces_enhanced.sql"),
        ),
        (
            9,
            "009_cross_workspace_refs",
            include_str!("../../migrations/009_cross_workspace_refs.sql"),
        ),
        (
            10,
            "010_advanced_views",
            include_str!("../../migrations/010_advanced_views.sql"),
        ),
        (
            11,
            "011_rebuild_fts",
            include_str!("../../migrations/011_rebuild_fts.sql"),
        ),
        (
            12,
            "012_recurrence_templates",
            include_str!("../../migrations/012_recurrence_templates.sql"),
        ),
    ];

    for (version, name, sql) in migrations {
        let applied: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM _migrations WHERE version = ?1",
            [version],
            |row| row.get(0),
        )?;

        if !applied {
            conn.execute_batch(sql)?;
            conn.execute(
                "INSERT INTO _migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
                rusqlite::params![version, name, crate::utils::time::now_iso()],
            )?;
        }
    }

    Ok(())
}
