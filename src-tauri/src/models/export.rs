use serde::{Deserialize, Serialize};

/// Result of an enhanced export operation.
#[derive(Debug, Clone, Serialize)]
pub struct EnhancedExportResult {
    pub exported_count: usize,
    pub output_path: String,
    pub format: String,
    pub errors: Vec<String>,
}

/// Supported export formats.
#[derive(Debug, Clone, Deserialize)]
pub enum ExportFormat {
    Json,
    Csv,
    Markdown,
}

/// Options for JSON workspace export.
#[derive(Debug, Clone, Deserialize)]
pub struct JsonExportOptions {
    pub workspace_id: String,
    pub output_path: String,
    pub include_notes: bool,
    pub include_tasks: bool,
    pub include_plans: bool,
    pub include_time_entries: bool,
    pub pretty_print: bool,
}

/// Options for CSV task export.
#[derive(Debug, Clone, Deserialize)]
pub struct CsvExportOptions {
    pub workspace_id: String,
    pub output_path: String,
    pub include_done: bool,
    pub include_cancelled: bool,
    pub delimiter: Option<String>,
}

/// Options for enhanced markdown note export.
#[derive(Debug, Clone, Deserialize)]
pub struct MarkdownExportOptions {
    pub workspace_id: String,
    pub output_dir: String,
    pub note_ids: Option<Vec<String>>,
    pub folder: Option<String>,
    pub include_front_matter: bool,
    pub flatten_folders: bool,
}
