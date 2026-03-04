use crate::db::connection::DbPool;
use std::sync::Arc;

/// Shared application state managed by Tauri.
///
/// Contains the database connection pool and the resolved data directory path.
/// Injected into all command handlers via `tauri::State`.
pub struct AppState {
    /// Thread-safe reference to the SQLite connection pool.
    pub db: Arc<DbPool>,
    /// Absolute path to the application data directory (e.g. `~/.flowdesk`).
    pub data_dir: String,
}
