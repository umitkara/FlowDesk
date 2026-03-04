use serde::{Deserialize, Serialize};

/// A workspace represents an isolated context (e.g. "Personal", "Work").
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Workspace {
    /// Unique identifier (UUID v7).
    pub id: String,
    /// Display name.
    pub name: String,
    /// URL-safe slug identifier.
    pub slug: String,
    /// Emoji or icon identifier.
    pub icon: Option<String>,
    /// Accent color hex code.
    pub color: Option<String>,
    /// Optional path for scheduled markdown auto-export.
    pub export_path: Option<String>,
    /// Display ordering.
    pub sort_order: i32,
    /// Workspace-specific configuration as JSON.
    pub config: Option<serde_json::Value>,
    /// Creation timestamp (ISO 8601).
    pub created_at: String,
    /// Last modification timestamp (ISO 8601).
    pub updated_at: String,
}
