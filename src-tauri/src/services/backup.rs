use crate::utils::errors::AppError;
use std::path::Path;

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
/// Runs `perform_backup` followed by `cleanup_old_backups` on the
/// configured interval. Logs errors to stderr but never panics.
pub fn start_backup_scheduler(
    db_path: String,
    backup_dir: String,
    interval_hours: u64,
    retention_days: u64,
) {
    std::thread::spawn(move || {
        let interval = std::time::Duration::from_secs(interval_hours * 3600);

        loop {
            std::thread::sleep(interval);

            if let Err(e) = perform_backup(&db_path, &backup_dir) {
                eprintln!("Backup failed: {}", e);
            }

            if let Err(e) = cleanup_old_backups(&backup_dir, retention_days) {
                eprintln!("Backup cleanup failed: {}", e);
            }
        }
    });
}
