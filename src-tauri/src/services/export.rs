use crate::models::note::Note;
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
