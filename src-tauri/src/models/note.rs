use serde::{Deserialize, Serialize};

/// A complete note entity including body content and metadata.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Note {
    /// Unique identifier (UUID v7).
    pub id: String,
    /// The workspace this note belongs to.
    pub workspace_id: String,
    /// Optional note title.
    pub title: Option<String>,
    /// Optional associated date (ISO 8601 date string).
    pub date: Option<String>,
    /// Markdown content body.
    pub body: String,
    /// Virtual folder path (e.g. "/projects/alpha").
    pub folder: Option<String>,
    /// User-defined category.
    pub category: Option<String>,
    /// Note type (journal, meeting, technical, draft, reference, etc.).
    #[serde(rename = "type")]
    pub note_type: Option<String>,
    /// Visual color label.
    pub color: Option<String>,
    /// Importance level (low, medium, high, critical).
    pub importance: Option<String>,
    /// Full YAML front matter as JSON for custom fields.
    pub front_matter: Option<serde_json::Value>,
    /// SHA-256 hash of the body content.
    pub body_hash: Option<String>,
    /// Tags associated with this note (populated via join).
    pub tags: Vec<String>,
    /// Creation timestamp (ISO 8601).
    pub created_at: String,
    /// Last modification timestamp (ISO 8601).
    pub updated_at: String,
    /// Soft-delete timestamp, if deleted.
    pub deleted_at: Option<String>,
}

/// Input for creating a new note.
#[derive(Debug, Deserialize)]
pub struct CreateNoteInput {
    /// The workspace to create the note in.
    pub workspace_id: String,
    /// Optional title.
    pub title: Option<String>,
    /// Optional associated date.
    pub date: Option<String>,
    /// Markdown body content.
    pub body: Option<String>,
    /// Virtual folder path.
    pub folder: Option<String>,
    /// Category label.
    pub category: Option<String>,
    /// Note type identifier.
    pub note_type: Option<String>,
    /// Visual color label.
    pub color: Option<String>,
    /// Importance level.
    pub importance: Option<String>,
    /// Custom front matter fields as JSON.
    pub front_matter: Option<serde_json::Value>,
    /// Tags to associate with this note.
    pub tags: Option<Vec<String>>,
}

/// Input for updating an existing note (all fields optional for partial updates).
#[derive(Debug, Deserialize)]
pub struct UpdateNoteInput {
    /// New title.
    pub title: Option<String>,
    /// New associated date.
    pub date: Option<String>,
    /// New body content.
    pub body: Option<String>,
    /// New folder path.
    pub folder: Option<String>,
    /// New category.
    pub category: Option<String>,
    /// New note type.
    pub note_type: Option<String>,
    /// New color label.
    pub color: Option<String>,
    /// New importance level.
    pub importance: Option<String>,
    /// New custom front matter.
    pub front_matter: Option<serde_json::Value>,
    /// New tag list (replaces existing tags).
    pub tags: Option<Vec<String>>,
}

/// Query parameters for filtering and paginating notes.
#[derive(Debug, Deserialize)]
pub struct NoteQuery {
    /// Filter by workspace.
    pub workspace_id: String,
    /// Filter by folder path.
    pub folder: Option<String>,
    /// Filter by category.
    pub category: Option<String>,
    /// Filter by note type.
    pub note_type: Option<String>,
    /// Filter by importance level.
    pub importance: Option<String>,
    /// Filter notes with date >= this value.
    pub date_from: Option<String>,
    /// Filter notes with date <= this value.
    pub date_to: Option<String>,
    /// Filter notes that have this tag.
    pub tag: Option<String>,
    /// Sort field: "updated_at", "created_at", "title", or "date".
    pub sort_by: Option<String>,
    /// Sort direction: "asc" or "desc".
    pub sort_order: Option<String>,
    /// Maximum number of results.
    pub limit: Option<i64>,
    /// Number of results to skip.
    pub offset: Option<i64>,
    /// Whether to include soft-deleted notes.
    pub include_deleted: Option<bool>,
    /// If true, return only soft-deleted notes (for trash view).
    pub only_deleted: Option<bool>,
}

/// A lightweight note representation for list views.
#[derive(Debug, Serialize)]
pub struct NoteListItem {
    /// Unique identifier.
    pub id: String,
    /// Note title.
    pub title: Option<String>,
    /// Associated date.
    pub date: Option<String>,
    /// Folder path.
    pub folder: Option<String>,
    /// Category.
    pub category: Option<String>,
    /// Note type.
    pub note_type: Option<String>,
    /// Color label.
    pub color: Option<String>,
    /// Importance level.
    pub importance: Option<String>,
    /// Associated tag names.
    pub tags: Vec<String>,
    /// Last modification timestamp.
    pub updated_at: String,
    /// Creation timestamp.
    pub created_at: String,
    /// Number of words in the body.
    pub word_count: i32,
    /// First ~200 characters of the body as a preview.
    pub preview: String,
}

/// A node in the virtual folder tree hierarchy.
#[derive(Debug, Serialize, Clone)]
pub struct FolderNode {
    /// Full path of this folder (e.g. "/projects/alpha").
    pub path: String,
    /// Display name (last segment of path).
    pub name: String,
    /// Child folders.
    pub children: Vec<FolderNode>,
    /// Number of notes directly in this folder.
    pub note_count: i32,
}
