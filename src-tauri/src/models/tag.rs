use serde::{Deserialize, Serialize};

/// A workspace-scoped tag that can be applied to notes.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tag {
    /// Unique identifier (UUID v7).
    pub id: String,
    /// The workspace this tag belongs to.
    pub workspace_id: String,
    /// Tag display name.
    pub name: String,
    /// Optional color hex code.
    pub color: Option<String>,
    /// Creation timestamp (ISO 8601).
    pub created_at: String,
}
