use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// The type of a template variable prompt.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum VariableType {
    /// A free-text input.
    Text,
    /// A dropdown/select input with predefined options.
    Select,
    /// A date picker input.
    Date,
    /// A number input.
    Number,
    /// A boolean (checkbox) input.
    Boolean,
}

/// A user-prompted variable definition within a template.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateVariable {
    /// The variable name (used in `{{name}}` substitution).
    pub name: String,
    /// Display label shown to the user.
    pub label: String,
    /// The type of input control to render.
    #[serde(rename = "type")]
    pub var_type: String,
    /// Default value (optional).
    pub default: Option<serde_json::Value>,
    /// Available options (for select type).
    pub options: Option<Vec<String>>,
}

/// A note template parsed from a markdown file with YAML front matter.
///
/// Templates live on disk in `~/.flowdesk/templates/` and are not stored
/// in the database. The front matter contains template metadata, default
/// note field values, and user-prompted variable definitions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteTemplate {
    /// The template's file name (e.g., "daily-note.md").
    pub file_name: String,
    /// Display name of the template.
    pub name: String,
    /// Short description shown in the template picker.
    pub description: String,
    /// Template format version (for future migration).
    pub version: u32,
    /// Default front matter values for notes created from this template.
    pub defaults: HashMap<String, serde_json::Value>,
    /// User-prompted variables with types, labels, defaults, and options.
    pub variables: Vec<TemplateVariable>,
    /// Markdown body below the front matter.
    pub body: String,
}

/// Input for creating a new template.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTemplateInput {
    /// File name for the template (e.g., "my-template.md").
    pub file_name: String,
    /// Display name.
    pub name: String,
    /// Short description.
    pub description: String,
    /// Default note field values.
    pub defaults: HashMap<String, serde_json::Value>,
    /// Variable definitions.
    pub variables: Vec<TemplateVariable>,
    /// Markdown body.
    pub body: String,
}

/// Input for updating an existing template.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTemplateInput {
    /// New display name.
    pub name: Option<String>,
    /// New description.
    pub description: Option<String>,
    /// New default values.
    pub defaults: Option<HashMap<String, serde_json::Value>>,
    /// New variable definitions.
    pub variables: Option<Vec<TemplateVariable>>,
    /// New markdown body.
    pub body: Option<String>,
}

/// A suggestion when the time tracker stops.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Suggestion {
    /// Whether this suggestion is a task or plan.
    pub entity_type: String,
    /// The entity ID.
    pub entity_id: String,
    /// The entity title.
    pub title: String,
    /// Relevance score (0.0 - 1.0).
    pub score: f64,
    /// Human-readable reason for the suggestion.
    pub reason: String,
}
