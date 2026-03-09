use crate::db::connection::DbPool;
use crate::models::undo::OperationHistory;
use crate::services::backup::BackupCommand;
use std::sync::{mpsc, Arc, Mutex};

/// Shared application state managed by Tauri.
///
/// Contains the database connection pool and the resolved data directory path.
/// Injected into all command handlers via `tauri::State`.
pub struct AppState {
    /// Thread-safe reference to the SQLite connection pool.
    pub db: Arc<DbPool>,
    /// Absolute path to the application data directory (e.g. `~/.flowdesk`).
    pub data_dir: String,
    /// In-memory undo/redo operation history.
    pub operation_history: Arc<Mutex<OperationHistory>>,
    /// Channel sender for reconfiguring the backup scheduler at runtime.
    pub backup_tx: Mutex<mpsc::Sender<BackupCommand>>,
}
