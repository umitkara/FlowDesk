use rusqlite::Connection;
use std::sync::Mutex;

/// Thread-safe SQLite connection wrapper.
///
/// Uses a `Mutex<Connection>` to serialize all database access.
/// WAL journal mode is enabled for crash safety and concurrent reads.
pub struct DbPool {
    conn: Mutex<Connection>,
}

impl DbPool {
    /// Opens or creates a SQLite database at the given path.
    ///
    /// Configures WAL journal mode, enables foreign keys, and sets
    /// a 5-second busy timeout for lock contention.
    pub fn new(path: &str) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;

        // Enable WAL mode for crash safety and concurrent reads
        conn.pragma_update(None, "journal_mode", "wal")?;
        // Enable foreign key constraint enforcement
        conn.pragma_update(None, "foreign_keys", "ON")?;
        // Wait up to 5 seconds when the database is locked
        conn.pragma_update(None, "busy_timeout", 5000)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Executes a closure with exclusive access to the database connection.
    ///
    /// The closure receives a reference to the underlying `rusqlite::Connection`
    /// and can perform any database operations needed.
    pub fn with_conn<F, T>(&self, f: F) -> Result<T, rusqlite::Error>
    where
        F: FnOnce(&Connection) -> Result<T, rusqlite::Error>,
    {
        let conn = self.conn.lock().expect("database mutex poisoned");
        f(&conn)
    }
}
