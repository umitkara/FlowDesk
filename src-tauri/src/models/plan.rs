use serde::{Deserialize, Serialize};

/// Represents a plan entity — a calendar-bound block of time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    /// Unique identifier (UUID v7).
    pub id: String,
    /// The workspace this plan belongs to.
    pub workspace_id: String,
    /// Plan title.
    pub title: String,
    /// Optional detailed description (markdown).
    pub description: Option<String>,
    /// Start time (ISO 8601 datetime).
    pub start_time: String,
    /// End time (ISO 8601 datetime).
    pub end_time: String,
    /// Whether this is an all-day plan (no specific time).
    pub all_day: bool,
    /// Plan type: time_block, event, daily_plan, or milestone.
    #[serde(rename = "type")]
    pub plan_type: String,
    /// User-defined category.
    pub category: Option<String>,
    /// Visual color label.
    pub color: Option<String>,
    /// Importance level: low, medium, high, or critical.
    pub importance: Option<String>,
    /// Tags as a JSON array of strings.
    pub tags: Option<serde_json::Value>,
    /// Recurrence rule as JSON (stored now, evaluated in Phase 7).
    pub recurrence: Option<serde_json::Value>,
    /// Creation timestamp (ISO 8601).
    pub created_at: String,
    /// Last modification timestamp (ISO 8601).
    pub updated_at: String,
    /// Soft-delete timestamp, if deleted.
    pub deleted_at: Option<String>,
    /// Whether reminders are muted for this plan.
    pub reminders_muted: bool,
}

/// Input for creating a new plan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePlanInput {
    /// The workspace to create the plan in.
    pub workspace_id: String,
    /// Plan title (must be non-empty).
    pub title: String,
    /// Optional description (markdown).
    pub description: Option<String>,
    /// Start time (ISO 8601 datetime, required).
    pub start_time: String,
    /// End time (ISO 8601 datetime, required).
    pub end_time: String,
    /// Whether this is an all-day plan (defaults to false).
    pub all_day: Option<bool>,
    /// Plan type (defaults to "time_block").
    #[serde(rename = "type")]
    pub plan_type: Option<String>,
    /// Optional category.
    pub category: Option<String>,
    /// Optional color label.
    pub color: Option<String>,
    /// Optional importance level.
    pub importance: Option<String>,
    /// Optional tags list.
    pub tags: Option<serde_json::Value>,
    /// Optional recurrence rule.
    pub recurrence: Option<serde_json::Value>,
    /// Whether to mute reminders for this plan.
    pub reminders_muted: Option<bool>,
}

/// Input for updating an existing plan. All fields optional (patch semantics).
///
/// Double-Option fields allow distinguishing "not provided" (outer None)
/// from "clear the value" (Some(None)).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePlanInput {
    /// Plan ID to update.
    pub id: String,
    /// New title.
    pub title: Option<String>,
    /// New description (Some(None) clears).
    pub description: Option<Option<String>>,
    /// New start time.
    pub start_time: Option<String>,
    /// New end time.
    pub end_time: Option<String>,
    /// New all-day flag.
    pub all_day: Option<bool>,
    /// New plan type.
    #[serde(rename = "type")]
    pub plan_type: Option<String>,
    /// New category (Some(None) clears).
    pub category: Option<Option<String>>,
    /// New color (Some(None) clears).
    pub color: Option<Option<String>>,
    /// New importance (Some(None) clears).
    pub importance: Option<Option<String>>,
    /// New tags (replaces existing).
    pub tags: Option<serde_json::Value>,
    /// New recurrence rule (Some(None) clears).
    pub recurrence: Option<Option<serde_json::Value>>,
    /// Whether to mute reminders for this plan.
    pub reminders_muted: Option<bool>,
}

/// Query parameters for listing plans.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanQuery {
    /// Filter by workspace (required).
    pub workspace_id: String,
    /// Plans starting after this datetime.
    pub start_after: Option<String>,
    /// Plans ending before this datetime.
    pub end_before: Option<String>,
    /// Filter by plan type.
    pub plan_type: Option<String>,
    /// Filter by category.
    pub category: Option<String>,
    /// Filter by importance.
    pub importance: Option<String>,
    /// Whether to include soft-deleted plans (default false).
    pub include_deleted: Option<bool>,
}

/// A plan with its linked entities for the detail view.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanWithLinks {
    /// The plan itself.
    pub plan: Plan,
    /// Tasks linked to this plan.
    pub linked_tasks: Vec<PlanLinkedTask>,
    /// Notes linked to this plan.
    pub linked_notes: Vec<PlanLinkedNote>,
}

/// A task linked to a plan (summary view).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanLinkedTask {
    /// Task ID.
    pub task_id: String,
    /// Task title.
    pub title: String,
    /// Task status.
    pub status: String,
    /// Task priority.
    pub priority: String,
    /// Relationship type (e.g. "spawned", "implements", "scheduled_in").
    pub relation: String,
}

/// A note linked to a plan (summary view).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanLinkedNote {
    /// Note ID.
    pub note_id: String,
    /// Note title.
    pub title: Option<String>,
    /// Note date.
    pub date: Option<String>,
    /// Relationship type (e.g. "spawned", "daily_note_for").
    pub relation: String,
}

/// Aggregated daily plan data for a single day.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyPlanSummary {
    /// The date this summary is for (ISO 8601 date).
    pub date: String,
    /// The daily plan for this date, if one exists.
    pub daily_plan: Option<Plan>,
    /// Time blocks for this date.
    pub time_blocks: Vec<Plan>,
    /// Events for this date.
    pub events: Vec<Plan>,
    /// Milestones for this date.
    pub milestones: Vec<Plan>,
    /// Deadlines for this date.
    pub deadlines: Vec<Plan>,
    /// Meetings for this date.
    pub meetings: Vec<Plan>,
    /// Review sessions for this date.
    pub reviews: Vec<Plan>,
    /// Habit entries for this date.
    pub habits: Vec<Plan>,
    /// Reminders for this date.
    pub reminders: Vec<Plan>,
    /// Tasks scheduled for this date.
    pub scheduled_tasks: Vec<PlanLinkedTask>,
}

/// A unified agenda item (plan or task) for the agenda view.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgendaItem {
    /// Type of item: "plan" or "task".
    pub item_type: String,
    /// Entity ID.
    pub id: String,
    /// Title.
    pub title: String,
    /// Start time (plans only).
    pub start_time: Option<String>,
    /// End time (plans only).
    pub end_time: Option<String>,
    /// Date (tasks: scheduled_date or due_date).
    pub date: Option<String>,
    /// Plan type (plans only).
    pub plan_type: Option<String>,
    /// Task status (tasks only).
    pub task_status: Option<String>,
    /// Task priority (tasks only).
    pub task_priority: Option<String>,
    /// Color label.
    pub color: Option<String>,
    /// Importance level.
    pub importance: Option<String>,
    /// Whether this is an all-day item.
    pub all_day: Option<bool>,
}

/// Input for spawning a task from a plan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpawnTaskInput {
    /// The plan to spawn from.
    pub plan_id: String,
    /// Title for the new task.
    pub title: String,
    /// Optional description.
    pub description: Option<String>,
    /// Optional priority.
    pub priority: Option<String>,
    /// Optional due date.
    pub due_date: Option<String>,
    /// Optional scheduled date (defaults to plan's start date).
    pub scheduled_date: Option<String>,
}

/// Input for spawning a note from a plan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpawnNoteInput {
    /// The plan to spawn from.
    pub plan_id: String,
    /// Optional title for the new note.
    pub title: Option<String>,
    /// Optional template body for the note.
    pub template_body: Option<String>,
    /// Optional note type (e.g. "meeting", "daily").
    pub note_type: Option<String>,
    /// Optional folder path.
    pub folder: Option<String>,
}

/// Valid plan types.
pub const VALID_PLAN_TYPES: &[&str] = &[
    "time_block",
    "event",
    "daily_plan",
    "milestone",
    "deadline",
    "meeting",
    "review",
    "habit",
    "reminder",
];

/// Valid importance levels.
pub const VALID_IMPORTANCE: &[&str] = &["low", "medium", "high", "critical"];
