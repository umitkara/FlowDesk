use serde::{Deserialize, Serialize};

/// Represents a reference (link) between two entities.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reference {
    /// Unique identifier (UUID v7).
    pub id: String,
    /// Entity type of the source (e.g. "note", "task").
    pub source_type: String,
    /// ID of the source entity.
    pub source_id: String,
    /// Entity type of the target (e.g. "note", "task", "url").
    pub target_type: String,
    /// ID of the target entity (for internal references).
    pub target_id: Option<String>,
    /// URI of the target (for external references like URLs or files).
    pub target_uri: Option<String>,
    /// Relationship type (e.g. "references", "blocks", "related_to").
    pub relation: String,
    /// Creation timestamp (ISO 8601).
    pub created_at: String,
}

/// Input for creating a reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReference {
    /// Entity type of the source.
    pub source_type: String,
    /// ID of the source entity.
    pub source_id: String,
    /// Entity type of the target.
    pub target_type: String,
    /// ID of the target entity (for internal references).
    pub target_id: Option<String>,
    /// URI of the target (for external references).
    pub target_uri: Option<String>,
    /// Relationship type (defaults to "references").
    pub relation: Option<String>,
}

/// Filter for querying references.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferenceFilter {
    /// Filter by source entity type.
    pub source_type: Option<String>,
    /// Filter by source entity ID.
    pub source_id: Option<String>,
    /// Filter by target entity type.
    pub target_type: Option<String>,
    /// Filter by target entity ID.
    pub target_id: Option<String>,
    /// Filter by relation type.
    pub relation: Option<String>,
}

/// A backlink result: an entity that references the queried entity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Backlink {
    /// The reference record itself.
    pub reference: Reference,
    /// Title of the source entity.
    pub source_title: String,
    /// Context snippet from the source (surrounding text of the reference).
    pub source_snippet: Option<String>,
}

/// Valid source/target entity types.
pub const VALID_ENTITY_TYPES: &[&str] = &["note", "task", "plan", "time_entry"];

/// Valid target-only types (includes external targets).
pub const VALID_TARGET_TYPES: &[&str] = &["note", "task", "plan", "time_entry", "url", "file"];

/// Valid relation types for Phase 2.
pub const VALID_RELATIONS: &[&str] = &[
    "references",
    "blocks",
    "blocked_by",
    "subtask_of",
    "related_to",
];
