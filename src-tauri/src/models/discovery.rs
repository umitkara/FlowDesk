use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Saved Filter
// ---------------------------------------------------------------------------

/// A persisted search filter configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedFilter {
    /// Unique identifier (UUID v7).
    pub id: String,
    /// Workspace this filter belongs to.
    pub workspace_id: String,
    /// Display name.
    pub name: String,
    /// Optional description.
    pub description: Option<String>,
    /// The filter configuration JSON.
    pub filter_config: FilterConfig,
    /// Display ordering.
    pub sort_order: i32,
    /// Whether this filter is pinned to the top.
    pub pinned: bool,
    /// Creation timestamp (ISO 8601).
    pub created_at: String,
    /// Last modification timestamp (ISO 8601).
    pub updated_at: String,
}

/// Filter configuration for faceted search.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FilterConfig {
    /// Entity types to include (note, task, plan, time_entry).
    pub entity_types: Option<Vec<String>>,
    /// Free-text search query.
    pub query: Option<String>,
    /// Tags to filter by.
    pub tags: Option<Vec<String>>,
    /// Tag matching mode: "any" (OR) or "all" (AND).
    pub tags_mode: Option<String>,
    /// Categories to include.
    pub categories: Option<Vec<String>>,
    /// Task statuses to include.
    pub statuses: Option<Vec<String>>,
    /// Task priorities to include.
    pub priorities: Option<Vec<String>>,
    /// Importance levels to include (notes/plans).
    pub importance: Option<Vec<String>>,
    /// Which date field to filter on (created_at, updated_at, date, etc.).
    pub date_field: Option<String>,
    /// Start of date range.
    pub date_from: Option<String>,
    /// End of date range.
    pub date_to: Option<String>,
    /// Folder paths to include (notes only).
    pub folders: Option<Vec<String>>,
    /// Note types to include.
    pub note_types: Option<Vec<String>>,
    /// Custom front matter field filters.
    pub front_matter_filters: Option<Vec<FrontMatterFilter>>,
    /// Entity that results must reference.
    pub has_references_to: Option<String>,
    /// Entity that must reference results.
    pub referenced_by: Option<String>,
    /// Sort field.
    pub sort_by: Option<String>,
    /// Sort direction: "asc" or "desc".
    pub sort_order: Option<String>,
    /// Maximum number of results.
    pub limit: Option<i64>,
}

/// A filter on a custom front matter field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrontMatterFilter {
    /// Front matter field name.
    pub field: String,
    /// Comparison operator (eq, neq, contains, gt, gte, lt, lte, exists, not_exists).
    pub operator: String,
    /// Value to compare against (optional for exists/not_exists).
    pub value: Option<String>,
}

/// Input for creating a saved filter.
#[derive(Debug, Deserialize)]
pub struct CreateFilterInput {
    /// Workspace ID.
    pub workspace_id: String,
    /// Display name.
    pub name: String,
    /// Optional description.
    pub description: Option<String>,
    /// The filter configuration.
    pub filter_config: FilterConfig,
    /// Whether to pin this filter.
    pub pinned: Option<bool>,
}

/// Input for updating a saved filter.
#[derive(Debug, Deserialize)]
pub struct UpdateFilterInput {
    /// New display name.
    pub name: Option<String>,
    /// New description.
    pub description: Option<String>,
    /// New filter configuration.
    pub filter_config: Option<FilterConfig>,
    /// Whether to pin/unpin.
    pub pinned: Option<bool>,
}

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

/// A single entry in the activity timeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEntry {
    /// Unique identifier (UUID v7).
    pub id: String,
    /// Workspace this activity belongs to.
    pub workspace_id: String,
    /// Entity type (note, task, plan, time_entry).
    pub entity_type: String,
    /// Entity identifier.
    pub entity_id: String,
    /// Denormalized entity title for display.
    pub entity_title: Option<String>,
    /// Action performed (created, updated, deleted, status_changed, etc.).
    pub action: String,
    /// Action-specific details.
    pub details: Option<serde_json::Value>,
    /// Who performed the action (user or system).
    pub actor: String,
    /// When the action occurred (ISO 8601).
    pub created_at: String,
}

/// Query parameters for the activity log.
#[derive(Debug, Deserialize)]
pub struct ActivityQuery {
    /// Workspace to query.
    pub workspace_id: String,
    /// Filter by entity type.
    pub entity_type: Option<String>,
    /// Filter by specific entity ID.
    pub entity_id: Option<String>,
    /// Filter by action.
    pub action: Option<String>,
    /// Start of date range.
    pub date_from: Option<String>,
    /// End of date range.
    pub date_to: Option<String>,
    /// Maximum number of results.
    pub limit: Option<i64>,
    /// Number of results to skip.
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

/// Graph data containing nodes and edges for visualization.
#[derive(Debug, Serialize)]
pub struct GraphData {
    /// Entity nodes.
    pub nodes: Vec<GraphNode>,
    /// Reference edges between nodes.
    pub edges: Vec<GraphEdge>,
}

/// A node in the entity relationship graph.
#[derive(Debug, Serialize, Clone)]
pub struct GraphNode {
    /// Entity ID.
    pub id: String,
    /// Entity type (note, task, plan, time_entry).
    pub entity_type: String,
    /// Entity title.
    pub title: String,
    /// Color label.
    pub color: Option<String>,
    /// Importance level (notes/plans).
    pub importance: Option<String>,
    /// Workspace ID.
    pub workspace_id: String,
}

/// An edge in the entity relationship graph.
#[derive(Debug, Serialize, Clone)]
pub struct GraphEdge {
    /// Reference ID.
    pub id: String,
    /// Source entity ID.
    pub source: String,
    /// Target entity ID.
    pub target: String,
    /// Relationship type.
    pub relation: String,
}

/// Query parameters for graph data retrieval.
#[derive(Debug, Deserialize)]
pub struct GraphQuery {
    /// Workspace to query.
    pub workspace_id: String,
    /// Entity types to include.
    pub entity_types: Option<Vec<String>>,
    /// Center the graph on this entity (BFS from here).
    pub center_entity_id: Option<String>,
    /// BFS depth from center entity (default: 2).
    pub depth: Option<i32>,
    /// Start of date range filter.
    pub date_from: Option<String>,
    /// End of date range filter.
    pub date_to: Option<String>,
    /// Maximum number of nodes (default: 500).
    pub max_nodes: Option<i32>,
}

// ---------------------------------------------------------------------------
// Faceted Search
// ---------------------------------------------------------------------------

/// A single result from faceted search.
#[derive(Debug, Serialize, Clone)]
pub struct FacetedSearchResult {
    /// Entity ID.
    pub id: String,
    /// Entity type (note, task, plan).
    pub entity_type: String,
    /// Entity title.
    pub title: String,
    /// FTS5 snippet with highlighted matches.
    pub snippet: Option<String>,
    /// Relevance rank.
    pub rank: f64,
    /// Category.
    pub category: Option<String>,
    /// Tags.
    pub tags: Vec<String>,
    /// Task status (tasks only).
    pub status: Option<String>,
    /// Task priority (tasks only).
    pub priority: Option<String>,
    /// Importance (notes/plans only).
    pub importance: Option<String>,
    /// Folder path (notes only).
    pub folder: Option<String>,
    /// Associated date.
    pub date: Option<String>,
    /// Workspace ID.
    pub workspace_id: String,
    /// Last modification timestamp.
    pub updated_at: String,
}

/// Full response from a faceted search including facet counts.
#[derive(Debug, Serialize)]
pub struct FacetedSearchResponse {
    /// Matching results.
    pub results: Vec<FacetedSearchResult>,
    /// Total count of matching entities.
    pub total_count: i64,
    /// Aggregated facet counts.
    pub facets: SearchFacets,
}

/// Aggregated counts for each facet dimension.
#[derive(Debug, Serialize)]
pub struct SearchFacets {
    /// Count per entity type.
    pub entity_type_counts: HashMap<String, i64>,
    /// Count per category.
    pub category_counts: HashMap<String, i64>,
    /// Count per tag.
    pub tag_counts: HashMap<String, i64>,
    /// Count per task status.
    pub status_counts: HashMap<String, i64>,
    /// Count per task priority.
    pub priority_counts: HashMap<String, i64>,
    /// Count per importance level.
    pub importance_counts: HashMap<String, i64>,
}

// ---------------------------------------------------------------------------
// Grouped View
// ---------------------------------------------------------------------------

/// Result of a grouped view query.
#[derive(Debug, Serialize)]
pub struct GroupedViewResult {
    /// Groups with their items.
    pub groups: Vec<GroupEntry>,
}

/// A single group in a grouped view.
#[derive(Debug, Serialize)]
pub struct GroupEntry {
    /// The field value being grouped on.
    pub key: String,
    /// Number of items in this group.
    pub count: i64,
    /// Items in this group.
    pub items: Vec<FacetedSearchResult>,
}

// ---------------------------------------------------------------------------
// Planned vs Actual
// ---------------------------------------------------------------------------

/// Comparison data between planned blocks and actual time entries for a day.
#[derive(Debug, Serialize)]
pub struct PlannedVsActualData {
    /// The date being compared.
    pub date: String,
    /// Planned time blocks for the day.
    pub planned_blocks: Vec<PlannedBlock>,
    /// Actual time entries for the day.
    pub actual_entries: Vec<ActualEntry>,
    /// Total planned minutes.
    pub planned_total_mins: i64,
    /// Total actual minutes tracked.
    pub actual_total_mins: i64,
    /// Difference (actual - planned).
    pub difference_mins: i64,
}

/// A planned time block from a plan entity.
#[derive(Debug, Serialize)]
pub struct PlannedBlock {
    /// Plan ID.
    pub plan_id: String,
    /// Plan title.
    pub title: String,
    /// Start time (ISO 8601).
    pub start_time: String,
    /// End time (ISO 8601).
    pub end_time: String,
    /// Duration in minutes.
    pub duration_mins: i64,
    /// Color label.
    pub color: Option<String>,
}

/// An actual time entry recorded for the day.
#[derive(Debug, Serialize)]
pub struct ActualEntry {
    /// Time entry ID.
    pub time_entry_id: String,
    /// Start time (ISO 8601).
    pub start_time: String,
    /// End time (ISO 8601).
    pub end_time: String,
    /// Active minutes (excluding pauses).
    pub active_mins: i64,
    /// Category.
    pub category: Option<String>,
    /// Linked plan ID.
    pub linked_plan_id: Option<String>,
    /// Linked task ID.
    pub linked_task_id: Option<String>,
    /// Preview of session notes.
    pub notes_preview: Option<String>,
}

// ---------------------------------------------------------------------------
// Backlink with Context
// ---------------------------------------------------------------------------

/// A backlink with surrounding context from the source entity.
#[derive(Debug, Serialize)]
pub struct BacklinkWithContext {
    /// Reference ID.
    pub reference_id: String,
    /// Source entity type.
    pub source_type: String,
    /// Source entity ID.
    pub source_id: String,
    /// Source entity title.
    pub source_title: String,
    /// Relationship type.
    pub relation: String,
    /// Surrounding text where the reference appears.
    pub context_snippet: String,
    /// Source entity last update timestamp.
    pub source_updated_at: String,
}
