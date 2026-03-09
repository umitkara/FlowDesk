/// Test infrastructure: in-memory database with all migrations applied.
use rusqlite::Connection;

/// Default workspace ID used across all test helpers.
pub const TEST_WS_ID: &str = "ws_test_00000000";

/// Creates an in-memory SQLite database with all migrations applied.
pub fn test_db() -> Connection {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;")
        .expect("set pragmas");

    // Run all migrations first to create the schema
    crate::db::migrations::run_migrations(&conn).expect("run migrations");

    // Re-enable foreign keys now that schema is ready
    conn.execute_batch("PRAGMA foreign_keys = ON;").expect("enable fk");

    // Insert a default test workspace
    conn.execute(
        "INSERT OR IGNORE INTO workspaces (id, name, slug, sort_order, config, created_at, updated_at)
         VALUES (?1, 'Test', 'test', 0, '{}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        [TEST_WS_ID],
    )
    .expect("insert test workspace");

    conn
}

/// Inserts a minimal test note and returns its ID.
pub fn insert_test_note(conn: &Connection, title: &str, body: &str) -> String {
    let id = crate::utils::id::generate_id();
    let now = crate::utils::time::now_iso();
    conn.execute(
        "INSERT INTO notes (id, workspace_id, title, body, folder, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, '/', ?5, ?5)",
        rusqlite::params![id, TEST_WS_ID, title, body, now],
    )
    .expect("insert test note");
    id
}

/// Inserts a minimal test task and returns its ID.
pub fn insert_test_task(
    conn: &Connection,
    title: &str,
    status: &str,
    parent_id: Option<&str>,
) -> String {
    let id = crate::utils::id::generate_id();
    let now = crate::utils::time::now_iso();
    conn.execute(
        "INSERT INTO tasks (id, workspace_id, title, status, priority, tags, parent_task_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'medium', '[]', ?5, ?6, ?6)",
        rusqlite::params![id, TEST_WS_ID, title, status, parent_id, now],
    )
    .expect("insert test task");
    id
}

/// Inserts a minimal test plan and returns its ID.
pub fn insert_test_plan(conn: &Connection, title: &str, start: &str, end: &str) -> String {
    let id = crate::utils::id::generate_id();
    let now = crate::utils::time::now_iso();
    conn.execute(
        "INSERT INTO plans (id, workspace_id, title, start_time, end_time, tags, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, '[]', ?6, ?6)",
        rusqlite::params![id, TEST_WS_ID, title, start, end, now],
    )
    .expect("insert test plan");
    id
}

/// Inserts a minimal test time entry and returns its ID.
pub fn insert_test_time_entry(
    conn: &Connection,
    start: &str,
    end: &str,
    active_mins: i64,
) -> String {
    let id = crate::utils::id::generate_id();
    let now = crate::utils::time::now_iso();
    conn.execute(
        "INSERT INTO time_entries (id, workspace_id, start_time, end_time, pauses, active_mins, notes, tags, session_notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, '[]', ?5, '', '[]', '[]', ?6, ?6)",
        rusqlite::params![id, TEST_WS_ID, start, end, active_mins, now],
    )
    .expect("insert test time_entry");
    id
}

/// Inserts a reference row between two entities.
pub fn insert_test_ref(
    conn: &Connection,
    source_type: &str,
    source_id: &str,
    target_type: &str,
    target_id: &str,
    relation: &str,
) -> String {
    let id = crate::utils::id::generate_id();
    let now = crate::utils::time::now_iso();
    conn.execute(
        "INSERT INTO refs (id, source_type, source_id, target_type, target_id, relation, source_workspace_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, source_type, source_id, target_type, target_id, relation, TEST_WS_ID, now],
    )
    .expect("insert test ref");
    id
}
