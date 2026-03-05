use serde::{Deserialize, Serialize};

/// Result of an import operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported_count: usize,
    pub skipped_count: usize,
    pub errors: Vec<ImportError>,
    pub warnings: Vec<ImportWarning>,
}

/// An error that occurred during import.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportError {
    pub file_path: String,
    pub message: String,
}

/// A non-fatal warning during import.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportWarning {
    pub file_path: String,
    pub message: String,
}

/// Options for markdown folder import.
#[derive(Debug, Clone, Deserialize)]
pub struct MarkdownImportOptions {
    pub source_dir: String,
    pub workspace_id: String,
    pub target_folder: Option<String>,
    pub preserve_folder_structure: bool,
    pub overwrite_existing: bool,
}

/// Options for Obsidian vault import.
#[derive(Debug, Clone, Deserialize)]
pub struct ObsidianImportOptions {
    pub vault_path: String,
    pub workspace_id: String,
    pub target_folder: Option<String>,
    pub convert_wikilinks: bool,
    pub import_tags: bool,
}

/// Options for CSV task import.
#[derive(Debug, Clone, Deserialize)]
pub struct CsvImportOptions {
    pub file_path: String,
    pub workspace_id: String,
    pub delimiter: Option<String>,
    pub has_header: bool,
    pub field_mapping: CsvFieldMapping,
}

/// Maps CSV columns to task fields.
#[derive(Debug, Clone, Deserialize)]
pub struct CsvFieldMapping {
    pub title: usize,
    pub description: Option<usize>,
    pub status: Option<usize>,
    pub priority: Option<usize>,
    pub due_date: Option<usize>,
    pub category: Option<usize>,
    pub tags: Option<usize>,
}

/// Preview of a CSV file for mapping UI.
#[derive(Debug, Clone, Serialize)]
pub struct CsvPreview {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub total_rows: usize,
}

/// A parsed markdown file with front matter.
#[derive(Debug, Clone)]
pub struct ParsedMarkdown {
    pub title: Option<String>,
    pub body: String,
    pub front_matter: Option<serde_json::Value>,
    pub tags: Vec<String>,
    pub relative_path: String,
}

/// A wikilink found in an Obsidian note.
#[derive(Debug, Clone)]
pub struct WikiLink {
    pub target: String,
    pub display_text: Option<String>,
    pub full_match: String,
}
