use crate::models::import::{
    CsvImportOptions, CsvPreview, ImportResult, MarkdownImportOptions, ObsidianImportOptions,
};
use crate::services::import as import_svc;
use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::{id::generate_id, time::now_iso};
use sha2::{Digest, Sha256};
use tauri::State;

fn compute_body_hash(body: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(body.as_bytes());
    hex::encode(hasher.finalize())
}

/// Imports a folder of markdown files as notes.
#[tauri::command]
pub fn import_markdown_folder(
    state: State<'_, AppState>,
    options: MarkdownImportOptions,
) -> Result<ImportResult, AppError> {
    let files = import_svc::scan_markdown_directory(
        &options.source_dir,
        options.target_folder.as_deref(),
        options.preserve_folder_structure,
    )
    .map_err(|e| AppError::Import(e.to_string()))?;

    let mut result = import_svc::empty_import_result();

    for parsed in files {
        let id = generate_id();
        let now = now_iso();
        let body_hash = compute_body_hash(&parsed.body);

        // Extract folder from relative_path if it contains a colon separator
        let folder = if parsed.relative_path.contains(':') {
            let parts: Vec<&str> = parsed.relative_path.splitn(2, ':').collect();
            Some(parts[0].to_string())
        } else {
            options.target_folder.clone()
        };

        let fm_json = parsed
            .front_matter
            .as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_default());

        let insert_result = state.db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO notes (id, workspace_id, title, body, folder, body_hash, front_matter, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    id,
                    options.workspace_id,
                    parsed.title,
                    parsed.body,
                    folder,
                    body_hash,
                    fm_json,
                    now,
                    now,
                ],
            )?;

            // Sync tags
            for tag_name in &parsed.tags {
                let tag_id: String = match conn.query_row(
                    "SELECT id FROM tags WHERE workspace_id = ?1 AND name = ?2",
                    rusqlite::params![options.workspace_id, tag_name],
                    |row| row.get(0),
                ) {
                    Ok(tid) => tid,
                    Err(rusqlite::Error::QueryReturnedNoRows) => {
                        let new_id = generate_id();
                        conn.execute(
                            "INSERT INTO tags (id, workspace_id, name, created_at) VALUES (?1, ?2, ?3, ?4)",
                            rusqlite::params![new_id, options.workspace_id, tag_name, now],
                        )?;
                        new_id
                    }
                    Err(e) => return Err(e),
                };

                conn.execute(
                    "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                    rusqlite::params![id, tag_id],
                )?;
            }

            Ok(())
        });

        match insert_result {
            Ok(()) => result.imported_count += 1,
            Err(e) => {
                result
                    .errors
                    .push(import_svc::import_error(&parsed.relative_path, &e.to_string()));
            }
        }
    }

    Ok(result)
}

/// Imports an Obsidian vault (markdown files with wikilink conversion).
#[tauri::command]
pub fn import_obsidian_vault(
    state: State<'_, AppState>,
    options: ObsidianImportOptions,
) -> Result<ImportResult, AppError> {
    let files = import_svc::scan_markdown_directory(
        &options.vault_path,
        options.target_folder.as_deref(),
        true,
    )
    .map_err(|e| AppError::Import(e.to_string()))?;

    let mut result = import_svc::empty_import_result();

    for mut parsed in files {
        // Skip Obsidian config files
        if parsed.relative_path.starts_with(".obsidian/") {
            result.skipped_count += 1;
            continue;
        }

        // Convert wikilinks if requested
        if options.convert_wikilinks {
            parsed.body = import_svc::convert_wikilinks(&parsed.body);
        }

        let id = generate_id();
        let now = now_iso();
        let body_hash = compute_body_hash(&parsed.body);

        let folder = if parsed.relative_path.contains(':') {
            let parts: Vec<&str> = parsed.relative_path.splitn(2, ':').collect();
            Some(parts[0].to_string())
        } else {
            options.target_folder.clone()
        };

        let fm_json = parsed
            .front_matter
            .as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_default());

        let insert_result = state.db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO notes (id, workspace_id, title, body, folder, body_hash, front_matter, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    id,
                    options.workspace_id,
                    parsed.title,
                    parsed.body,
                    folder,
                    body_hash,
                    fm_json,
                    now,
                    now,
                ],
            )?;

            if options.import_tags {
                for tag_name in &parsed.tags {
                    let tag_id: String = match conn.query_row(
                        "SELECT id FROM tags WHERE workspace_id = ?1 AND name = ?2",
                        rusqlite::params![options.workspace_id, tag_name],
                        |row| row.get(0),
                    ) {
                        Ok(tid) => tid,
                        Err(rusqlite::Error::QueryReturnedNoRows) => {
                            let new_id = generate_id();
                            conn.execute(
                                "INSERT INTO tags (id, workspace_id, name, created_at) VALUES (?1, ?2, ?3, ?4)",
                                rusqlite::params![new_id, options.workspace_id, tag_name, now],
                            )?;
                            new_id
                        }
                        Err(e) => return Err(e),
                    };

                    conn.execute(
                        "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                        rusqlite::params![id, tag_id],
                    )?;
                }
            }

            Ok(())
        });

        match insert_result {
            Ok(()) => result.imported_count += 1,
            Err(e) => {
                result
                    .errors
                    .push(import_svc::import_error(&parsed.relative_path, &e.to_string()));
            }
        }
    }

    Ok(result)
}

/// Imports tasks from a CSV file.
#[tauri::command]
pub fn import_csv_tasks(
    state: State<'_, AppState>,
    options: CsvImportOptions,
) -> Result<ImportResult, AppError> {
    let rows = import_svc::import_csv_tasks(
        &options.file_path,
        options.delimiter.as_deref(),
        options.has_header,
        options.field_mapping.title,
        options.field_mapping.description,
        options.field_mapping.status,
        options.field_mapping.priority,
        options.field_mapping.due_date,
        options.field_mapping.category,
        options.field_mapping.tags,
    )
    .map_err(AppError::Import)?;

    let mut result = import_svc::empty_import_result();

    for row in rows {
        let title = row.title;
        let description = row.description;
        let due_date = row.due_date;
        let category = row.category;
        let tags_str = row.tags;
        let id = generate_id();
        let now = now_iso();

        let status = row.status
            .as_deref()
            .map(normalize_status)
            .unwrap_or_else(|| "todo".to_string());
        let priority = row.priority
            .as_deref()
            .map(normalize_priority)
            .unwrap_or_else(|| "none".to_string());

        let tags_json = tags_str.map(|s| {
            let tags: Vec<String> = s.split(',').map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).collect();
            serde_json::to_string(&tags).unwrap_or("[]".to_string())
        });

        let insert_result = state.db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO tasks (id, workspace_id, title, description, status, priority, due_date, category, tags, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                rusqlite::params![
                    id,
                    options.workspace_id,
                    title,
                    description,
                    status,
                    priority,
                    due_date,
                    category,
                    tags_json,
                    now,
                    now,
                ],
            )?;
            Ok(())
        });

        match insert_result {
            Ok(()) => result.imported_count += 1,
            Err(e) => {
                result
                    .errors
                    .push(import_svc::import_error(&title, &e.to_string()));
            }
        }
    }

    Ok(result)
}

/// Previews a CSV file for field mapping.
#[tauri::command]
pub fn preview_csv(
    file_path: String,
    delimiter: Option<String>,
) -> Result<CsvPreview, AppError> {
    import_svc::parse_csv_preview(&file_path, delimiter.as_deref(), 5)
        .map_err(AppError::Import)
}

fn normalize_status(s: &str) -> String {
    match s.to_lowercase().trim() {
        "inbox" => "inbox",
        "todo" | "to do" | "to-do" | "open" | "new" => "todo",
        "in_progress" | "in progress" | "in-progress" | "doing" | "wip" | "started" => "in_progress",
        "done" | "complete" | "completed" | "finished" | "closed" => "done",
        "cancelled" | "canceled" => "cancelled",
        _ => "todo",
    }
    .to_string()
}

fn normalize_priority(s: &str) -> String {
    match s.to_lowercase().trim() {
        "none" | "n/a" | "-" | "" => "none",
        "low" | "1" | "p3" | "p4" => "low",
        "medium" | "med" | "2" | "p2" | "normal" => "medium",
        "high" | "3" | "p1" | "important" => "high",
        "urgent" | "4" | "p0" | "critical" => "urgent",
        _ => "none",
    }
    .to_string()
}
