use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// WorkspaceConfig — per-workspace configuration stored in the `config` JSON column
// ---------------------------------------------------------------------------

/// Per-workspace configuration stored in the `config` JSON column.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConfig {
    /// Custom categories available in this workspace.
    #[serde(default = "default_categories")]
    pub categories: Vec<String>,
    /// Note types available in category/type pickers.
    #[serde(default = "default_note_types")]
    pub note_types: Vec<String>,
    /// Task category options.
    #[serde(default = "default_task_categories")]
    pub task_categories: Vec<String>,
    /// Template slug used when creating notes in this workspace.
    #[serde(default)]
    pub default_note_template: Option<String>,
    /// Hex color applied to workspace UI chrome.
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
    /// Ordered list of widget identifiers for the dashboard.
    #[serde(default = "default_dashboard_widgets")]
    pub dashboard_widgets: Vec<String>,
}

impl Default for WorkspaceConfig {
    fn default() -> Self {
        Self {
            categories: default_categories(),
            note_types: default_note_types(),
            task_categories: default_task_categories(),
            default_note_template: None,
            accent_color: default_accent_color(),
            dashboard_widgets: default_dashboard_widgets(),
        }
    }
}

fn default_categories() -> Vec<String> {
    vec!["general".into()]
}

fn default_note_types() -> Vec<String> {
    vec![
        "journal".into(),
        "meeting".into(),
        "technical".into(),
        "draft".into(),
        "reference".into(),
    ]
}

fn default_task_categories() -> Vec<String> {
    vec!["bug".into(), "feature".into(), "chore".into()]
}

fn default_accent_color() -> String {
    "#3b82f6".into()
}

fn default_dashboard_widgets() -> Vec<String> {
    vec![
        "today_plan".into(),
        "pending_tasks".into(),
        "recent_notes".into(),
        "time_today".into(),
    ]
}

// ---------------------------------------------------------------------------
// Workspace — full database record
// ---------------------------------------------------------------------------

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
    /// Optional path for workspace-specific attachments.
    pub attachment_path: Option<String>,
    /// Display ordering.
    pub sort_order: i32,
    /// Per-workspace configuration.
    pub config: WorkspaceConfig,
    /// Creation timestamp (ISO 8601).
    pub created_at: String,
    /// Last modification timestamp (ISO 8601).
    pub updated_at: String,
    /// Soft-delete timestamp (nullable).
    pub deleted_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/// Input for creating a new workspace.
#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceInput {
    /// Display name.
    pub name: String,
    /// Emoji or icon identifier.
    pub icon: Option<String>,
    /// Accent color hex code.
    pub color: Option<String>,
    /// Optional path for scheduled markdown auto-export.
    pub export_path: Option<String>,
    /// Initial configuration (defaults applied if omitted).
    pub config: Option<WorkspaceConfig>,
}

/// Input for updating an existing workspace.
#[derive(Debug, Deserialize)]
pub struct UpdateWorkspaceInput {
    /// Workspace ID.
    pub id: String,
    /// New display name.
    pub name: Option<String>,
    /// New icon.
    pub icon: Option<String>,
    /// New accent color.
    pub color: Option<String>,
    /// New export path.
    pub export_path: Option<String>,
    /// New attachment path.
    pub attachment_path: Option<String>,
    /// New sort order.
    pub sort_order: Option<i32>,
    /// New configuration (full replacement).
    pub config: Option<WorkspaceConfig>,
}

/// Input for reordering workspaces.
#[derive(Debug, Deserialize)]
pub struct ReorderWorkspacesInput {
    /// List of workspace IDs in the desired order.
    pub workspace_ids: Vec<String>,
}

// ---------------------------------------------------------------------------
// Summary / badge types
// ---------------------------------------------------------------------------

/// Lightweight workspace info for the workspace switcher list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSummary {
    /// Workspace ID.
    pub id: String,
    /// Display name.
    pub name: String,
    /// URL-safe slug.
    pub slug: String,
    /// Emoji or icon.
    pub icon: Option<String>,
    /// Accent color hex.
    pub color: Option<String>,
    /// Display ordering.
    pub sort_order: i32,
    /// Number of non-deleted notes.
    pub note_count: i64,
    /// Number of non-deleted tasks.
    pub task_count: i64,
}

/// Minimal workspace info for cross-workspace reference badges.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceBadge {
    /// Workspace ID.
    pub id: String,
    /// Display name.
    pub name: String,
    /// URL-safe slug.
    pub slug: String,
    /// Emoji or icon.
    pub icon: Option<String>,
    /// Accent color hex.
    pub color: Option<String>,
}

// ---------------------------------------------------------------------------
// Dashboard types
// ---------------------------------------------------------------------------

/// Aggregated dashboard data for a workspace.
#[derive(Debug, Serialize)]
pub struct DashboardData {
    /// Plans scheduled for today.
    pub today_plan: Vec<DashboardPlan>,
    /// Open tasks (inbox + todo + in_progress).
    pub pending_tasks: Vec<DashboardTask>,
    /// Last 10 modified notes.
    pub recent_notes: Vec<DashboardNote>,
    /// Time tracked today.
    pub time_today: TimeSummary,
    /// Sticky tasks still open.
    pub sticky_tasks: Vec<DashboardTask>,
    /// Tasks with due_date in next 7 days.
    pub upcoming_deadlines: Vec<DashboardTask>,
}

/// A plan item for the dashboard.
#[derive(Debug, Serialize)]
pub struct DashboardPlan {
    /// Plan ID.
    pub id: String,
    /// Plan title.
    pub title: String,
    /// Start time.
    pub start_time: String,
    /// End time.
    pub end_time: String,
    /// Plan type.
    pub plan_type: String,
    /// Color.
    pub color: Option<String>,
}

/// A task item for the dashboard.
#[derive(Debug, Serialize)]
pub struct DashboardTask {
    /// Task ID.
    pub id: String,
    /// Task title.
    pub title: String,
    /// Task status.
    pub status: String,
    /// Task priority.
    pub priority: String,
    /// Due date.
    pub due_date: Option<String>,
    /// Color.
    pub color: Option<String>,
}

/// A note item for the dashboard.
#[derive(Debug, Serialize)]
pub struct DashboardNote {
    /// Note ID.
    pub id: String,
    /// Note title.
    pub title: Option<String>,
    /// Note type.
    pub note_type: Option<String>,
    /// Folder.
    pub folder: Option<String>,
    /// Last update timestamp.
    pub updated_at: String,
}

/// Time tracked today summary.
#[derive(Debug, Serialize)]
pub struct TimeSummary {
    /// Total minutes tracked.
    pub total_mins: i64,
    /// Active minutes (excluding pauses).
    pub active_mins: i64,
    /// Number of time entries.
    pub entry_count: i64,
}

// ---------------------------------------------------------------------------
// Slugify helper
// ---------------------------------------------------------------------------

/// Generates a URL-safe slug from a workspace name.
pub fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}
