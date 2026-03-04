use serde::{Deserialize, Serialize};

/// Represents a task entity in the database.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    /// Unique identifier (UUID v7).
    pub id: String,
    /// The workspace this task belongs to.
    pub workspace_id: String,
    /// Task title.
    pub title: String,
    /// Optional detailed description (markdown).
    pub description: Option<String>,
    /// Current status (inbox, todo, in_progress, done, cancelled).
    pub status: String,
    /// Priority level (none, low, medium, high, urgent).
    pub priority: String,
    /// Optional deadline date (ISO 8601 date string).
    pub due_date: Option<String>,
    /// Optional scheduled work date (ISO 8601 date string).
    pub scheduled_date: Option<String>,
    /// Timestamp when task was completed or cancelled.
    pub completed_at: Option<String>,
    /// User-defined category.
    pub category: Option<String>,
    /// Visual color label.
    pub color: Option<String>,
    /// Tags as a JSON array of strings.
    pub tags: Option<serde_json::Value>,
    /// Estimated time to complete in minutes.
    pub estimated_mins: Option<i64>,
    /// Accumulated actual time spent in minutes.
    pub actual_mins: i64,
    /// Recurrence rule as JSON (structural only, not executed in Phase 2).
    pub recurrence: Option<serde_json::Value>,
    /// Parent task ID for subtask hierarchy.
    pub parent_task_id: Option<String>,
    /// Whether this task persists in every daily view until completed.
    pub is_sticky: bool,
    /// Creation timestamp (ISO 8601).
    pub created_at: String,
    /// Last modification timestamp (ISO 8601).
    pub updated_at: String,
    /// Soft-delete timestamp, if deleted.
    pub deleted_at: Option<String>,
}

/// Input for creating a new task.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTask {
    /// The workspace to create the task in.
    pub workspace_id: String,
    /// Task title (must be non-empty).
    pub title: String,
    /// Optional description.
    pub description: Option<String>,
    /// Initial status (defaults to "inbox").
    pub status: Option<String>,
    /// Initial priority (defaults to "none").
    pub priority: Option<String>,
    /// Optional deadline date.
    pub due_date: Option<String>,
    /// Optional scheduled date.
    pub scheduled_date: Option<String>,
    /// Optional category.
    pub category: Option<String>,
    /// Optional color label.
    pub color: Option<String>,
    /// Optional tags list.
    pub tags: Option<Vec<String>>,
    /// Optional estimated time in minutes.
    pub estimated_mins: Option<i64>,
    /// Optional recurrence rule.
    pub recurrence: Option<serde_json::Value>,
    /// Optional parent task ID for subtask creation.
    pub parent_task_id: Option<String>,
    /// Whether the task is sticky (defaults to false).
    pub is_sticky: Option<bool>,
}

/// Input for updating an existing task. All fields optional (patch semantics).
///
/// Double-Option fields (e.g. `Option<Option<String>>`) allow distinguishing
/// between "not provided" (outer None) and "clear the value" (Some(None)).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTask {
    /// New title.
    pub title: Option<String>,
    /// New description.
    pub description: Option<Option<String>>,
    /// New status.
    pub status: Option<String>,
    /// New priority.
    pub priority: Option<String>,
    /// New due date (Some(None) clears).
    pub due_date: Option<Option<String>>,
    /// New scheduled date (Some(None) clears).
    pub scheduled_date: Option<Option<String>>,
    /// New category (Some(None) clears).
    pub category: Option<Option<String>>,
    /// New color (Some(None) clears).
    pub color: Option<Option<String>>,
    /// New tags list (replaces existing).
    pub tags: Option<Vec<String>>,
    /// New estimated minutes (Some(None) clears).
    pub estimated_mins: Option<Option<i64>>,
    /// New actual minutes.
    pub actual_mins: Option<i64>,
    /// New recurrence rule (Some(None) clears).
    pub recurrence: Option<Option<serde_json::Value>>,
    /// New parent task ID (Some(None) clears).
    pub parent_task_id: Option<Option<String>>,
    /// New sticky flag.
    pub is_sticky: Option<bool>,
}

/// Filters for querying tasks.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TaskFilter {
    /// Filter by workspace (required).
    pub workspace_id: String,
    /// Match any of these statuses.
    pub status: Option<Vec<String>>,
    /// Match any of these priorities.
    pub priority: Option<Vec<String>>,
    /// Match this category.
    pub category: Option<String>,
    /// Match tasks containing this tag.
    pub tag: Option<String>,
    /// Tasks with due_date <= this value.
    pub due_before: Option<String>,
    /// Tasks with due_date >= this value.
    pub due_after: Option<String>,
    /// Exact scheduled_date match.
    pub scheduled_date: Option<String>,
    /// Some(None) = top-level only, Some(Some(id)) = children of parent.
    pub parent_task_id: Option<Option<String>>,
    /// Filter by sticky flag.
    pub is_sticky: Option<bool>,
    /// Whether to include done/cancelled tasks (default false for board).
    pub include_done: Option<bool>,
    /// Whether to include soft-deleted tasks (default false).
    pub include_deleted: Option<bool>,
    /// FTS5 search query.
    pub search_query: Option<String>,
}

/// Sort configuration for task queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSort {
    /// Column to sort by: title, status, priority, due_date, created_at, updated_at.
    pub field: String,
    /// Sort direction: asc or desc.
    pub direction: String,
}

/// A task with its subtask count and depth info for tree rendering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskWithChildren {
    /// The task itself (flattened into this struct).
    #[serde(flatten)]
    pub task: Task,
    /// Total number of direct subtasks.
    pub subtask_count: i64,
    /// Number of completed direct subtasks.
    pub completed_subtask_count: i64,
}

/// Validated status values.
pub const VALID_STATUSES: &[&str] = &["inbox", "todo", "in_progress", "done", "cancelled"];

/// Validated priority values.
pub const VALID_PRIORITIES: &[&str] = &["none", "low", "medium", "high", "urgent"];
