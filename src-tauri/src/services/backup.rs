use crate::utils::errors::AppError;
use std::path::Path;
use std::sync::mpsc;

/// Commands sent to the backup scheduler to reconfigure it at runtime.
pub enum BackupCommand {
    Reconfigure {
        enabled: bool,
        interval_hours: u64,
        retention_days: u64,
    },
}

/// Performs a single backup by copying the database file.
///
/// The backup file is named `flowdesk-{timestamp}.db` and placed in the
/// given `backup_dir`. Creates the backup directory if it does not exist.
pub fn perform_backup(db_path: &str, backup_dir: &str) -> Result<String, AppError> {
    let backup_path = Path::new(backup_dir);
    std::fs::create_dir_all(backup_path)?;

    let timestamp = chrono::Utc::now().format("%Y-%m-%dT%H-%M-%S");
    let backup_file = backup_path.join(format!("flowdesk-{}.db", timestamp));

    std::fs::copy(db_path, &backup_file)?;

    Ok(backup_file.to_string_lossy().to_string())
}

/// Removes backup files older than the specified retention period.
///
/// Returns the number of backup files that were deleted.
pub fn cleanup_old_backups(backup_dir: &str, retention_days: u64) -> Result<i32, AppError> {
    let backup_path = Path::new(backup_dir);
    if !backup_path.exists() {
        return Ok(0);
    }

    let cutoff = chrono::Utc::now() - chrono::Duration::days(retention_days as i64);
    let mut deleted = 0;

    let entries = std::fs::read_dir(backup_path)?;
    for entry in entries {
        let entry = entry?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        // Only consider files matching our naming pattern
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if !file_name.starts_with("flowdesk-") || !file_name.ends_with(".db") {
            continue;
        }

        // Check file modification time
        if let Ok(metadata) = entry.metadata() {
            if let Ok(modified) = metadata.modified() {
                let modified_dt: chrono::DateTime<chrono::Utc> = modified.into();
                if modified_dt < cutoff && std::fs::remove_file(&path).is_ok() {
                    deleted += 1;
                }
            }
        }
    }

    Ok(deleted)
}

/// Starts a background backup scheduler on a dedicated thread.
///
/// Uses a channel-based tick loop (30s poll) so the scheduler can be
/// reconfigured at runtime when backup settings change.
pub fn start_backup_scheduler(
    db_path: String,
    backup_dir: String,
    initial_enabled: bool,
    initial_interval_hours: u64,
    initial_retention_days: u64,
    rx: mpsc::Receiver<BackupCommand>,
) {
    std::thread::spawn(move || {
        let tick = std::time::Duration::from_secs(30);
        let mut enabled = initial_enabled;
        let mut interval_secs = initial_interval_hours * 3600;
        let mut retention_days = initial_retention_days;
        let mut last_backup_at = std::time::Instant::now();

        loop {
            match rx.recv_timeout(tick) {
                Ok(BackupCommand::Reconfigure {
                    enabled: new_enabled,
                    interval_hours,
                    retention_days: new_retention,
                }) => {
                    enabled = new_enabled;
                    interval_secs = interval_hours * 3600;
                    retention_days = new_retention;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }

            // Drain any additional queued commands
            while let Ok(BackupCommand::Reconfigure {
                enabled: new_enabled,
                interval_hours,
                retention_days: new_retention,
            }) = rx.try_recv()
            {
                enabled = new_enabled;
                interval_secs = interval_hours * 3600;
                retention_days = new_retention;
            }

            if !enabled {
                continue;
            }

            let interval = std::time::Duration::from_secs(interval_secs);
            if last_backup_at.elapsed() >= interval {
                if let Err(e) = perform_backup(&db_path, &backup_dir) {
                    eprintln!("Backup failed: {}", e);
                }
                if let Err(e) = cleanup_old_backups(&backup_dir, retention_days) {
                    eprintln!("Backup cleanup failed: {}", e);
                }
                last_backup_at = std::time::Instant::now();
            }
        }
    });
}
