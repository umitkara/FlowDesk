use crate::models::note::Note;
use crate::models::task::Task;
use crate::services::frontmatter;
use crate::utils::errors::AppError;
use std::path::Path;

/// Converts a note to a complete markdown string with YAML front matter.
pub fn note_to_markdown(note: &Note) -> String {
    frontmatter::build_front_matter(note)
}

/// Export result describing the outcome of a batch export operation.
#[derive(Debug, serde::Serialize)]
pub struct ExportServiceResult {
    /// Number of notes successfully exported.
    pub exported_count: i32,
    /// Absolute path to the output directory.
    pub output_dir: String,
    /// Error messages for notes that failed to export.
    pub errors: Vec<String>,
}

/// Exports a collection of notes to markdown files in a directory.
///
/// Preserves the folder structure: a note with folder `/projects/alpha`
/// is written to `output_dir/projects/alpha/<title-or-id>.md`.
/// Notes without a folder are written to the root of `output_dir`.
pub fn export_to_directory(notes: &[Note], output_dir: &Path) -> Result<ExportServiceResult, AppError> {
    let mut exported_count = 0;
    let mut errors: Vec<String> = Vec::new();

    for note in notes {
        let markdown = note_to_markdown(note);

        // Determine the file name from the title or the note id
        let file_name = note
            .title
            .as_deref()
            .unwrap_or(&note.id);
        // Sanitize the file name: replace path-unsafe characters
        let safe_name: String = file_name
            .chars()
            .map(|c| if c == '/' || c == '\\' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|' {
                '_'
            } else {
                c
            })
            .collect();
        let file_name_with_ext = format!("{}.md", safe_name);

        // Build the full output path, preserving folder structure
        let mut file_path = output_dir.to_path_buf();
        if let Some(ref folder) = note.folder {
            let clean_folder = folder.trim_start_matches('/');
            if !clean_folder.is_empty() {
                file_path.push(clean_folder);
            }
        }

        // Create parent directories
        if let Err(e) = std::fs::create_dir_all(&file_path) {
            errors.push(format!("Failed to create directory for note {}: {}", note.id, e));
            continue;
        }

        file_path.push(&file_name_with_ext);

        match std::fs::write(&file_path, markdown) {
            Ok(()) => exported_count += 1,
            Err(e) => errors.push(format!("Failed to write note {}: {}", note.id, e)),
        }
    }

    Ok(ExportServiceResult {
        exported_count,
        output_dir: output_dir.to_string_lossy().to_string(),
        errors,
    })
}

/// Serializes a set of notes and tasks into a combined JSON workspace export.
pub fn serialize_workspace_json(
    notes: &[Note],
    tasks: &[Task],
    pretty: bool,
) -> Result<String, AppError> {
    let export = serde_json::json!({
        "version": "1.0",
        "exported_at": crate::utils::time::now_iso(),
        "notes": notes,
        "tasks": tasks,
    });

    if pretty {
        serde_json::to_string_pretty(&export).map_err(AppError::Serialization)
    } else {
        serde_json::to_string(&export).map_err(AppError::Serialization)
    }
}

/// Serializes tasks into a CSV string.
pub fn serialize_tasks_csv(tasks: &[Task]) -> Result<String, AppError> {
    let mut wtr = csv::Writer::from_writer(Vec::new());

    wtr.write_record([
        "id", "title", "description", "status", "priority",
        "due_date", "scheduled_date", "category", "tags",
        "estimated_mins", "actual_mins", "created_at", "updated_at",
    ])
    .map_err(|e| AppError::Export(e.to_string()))?;

    for task in tasks {
        let tags_str = task
            .tags
            .as_ref()
            .and_then(|v| {
                if let serde_json::Value::Array(arr) = v {
                    Some(
                        arr.iter()
                            .filter_map(|item| item.as_str().map(String::from))
                            .collect::<Vec<_>>()
                            .join(", "),
                    )
                } else {
                    None
                }
            })
            .unwrap_or_default();

        wtr.write_record([
            &task.id,
            &task.title,
            task.description.as_deref().unwrap_or(""),
            &task.status,
            &task.priority,
            task.due_date.as_deref().unwrap_or(""),
            task.scheduled_date.as_deref().unwrap_or(""),
            task.category.as_deref().unwrap_or(""),
            &tags_str,
            &task.estimated_mins.map(|m| m.to_string()).unwrap_or_default(),
            &task.actual_mins.to_string(),
            &task.created_at,
            &task.updated_at,
        ])
        .map_err(|e| AppError::Export(e.to_string()))?;
    }

    let bytes = wtr
        .into_inner()
        .map_err(|e| AppError::Export(e.to_string()))?;
    String::from_utf8(bytes).map_err(|e| AppError::Export(e.to_string()))
}
