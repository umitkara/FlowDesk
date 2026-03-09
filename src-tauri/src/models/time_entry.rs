use serde::{Deserialize, Serialize};

/// A pause interval within a tracking session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pause {
    /// When the pause started (ISO 8601, UTC).
    pub paused_at: String,
    /// When the pause ended. `None` if the session is currently paused.
    pub resumed_at: Option<String>,
}

/// A timestamped note taken during an active tracking session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionNote {
    /// Active elapsed minutes at the time this note was taken.
    pub elapsed_mins: f64,
    /// Wall-clock time when this note was taken (ISO 8601, UTC).
    pub wall_time: String,
    /// The note text.
    pub text: String,
    /// Optional reference entity type (e.g. "task", "note").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ref_type: Option<String>,
    /// Optional reference entity ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ref_id: Option<String>,
}

/// A recorded time tracking session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeEntry {
    /// Unique identifier (UUID v7).
    pub id: String,
    /// The workspace this entry belongs to.
    pub workspace_id: String,
    /// When tracking started (ISO 8601, UTC).
    pub start_time: String,
    /// When tracking stopped. `None` while the session is still running.
    pub end_time: Option<String>,
    /// List of pause intervals during the session.
    pub pauses: Vec<Pause>,
    /// Total active minutes (excluding pauses). Computed on stop.
    pub active_mins: Option<i64>,
    /// Freeform markdown notes for the session.
    pub notes: String,
    /// User-defined category.
    pub category: Option<String>,
    /// Tags as a list of strings.
    pub tags: Vec<String>,
    /// Timestamped session notes taken during tracking.
    pub session_notes: Vec<SessionNote>,
    /// Linked plan ID (auto-set when started from a plan).
    pub linked_plan_id: Option<String>,
    /// Linked task ID (auto-set when started from a task).
    pub linked_task_id: Option<String>,
    /// Creation timestamp (ISO 8601).
    pub created_at: String,
    /// Last modification timestamp (ISO 8601).
    pub updated_at: String,
    /// Soft-delete timestamp, if deleted.
    pub deleted_at: Option<String>,
}

/// Tracker status values for the state machine.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TrackerStatus {
    /// No active session.
    Idle,
    /// Timer is counting.
    Running,
    /// Timer is paused.
    Paused,
}

/// Break reminder mode.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum BreakMode {
    /// No break reminders.
    #[default]
    None,
    /// Pomodoro technique intervals.
    Pomodoro,
    /// Custom reminder interval.
    Custom,
}


/// Pomodoro break configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PomodoroConfig {
    /// Work interval in minutes (default 25).
    pub work_mins: u32,
    /// Short break interval in minutes (default 5).
    pub short_break_mins: u32,
    /// Long break interval in minutes (default 15).
    pub long_break_mins: u32,
    /// Number of work cycles before a long break (default 4).
    pub cycles_before_long: u32,
}

impl Default for PomodoroConfig {
    fn default() -> Self {
        Self {
            work_mins: 25,
            short_break_mins: 5,
            long_break_mins: 15,
            cycles_before_long: 4,
        }
    }
}

/// Custom break configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomBreakConfig {
    /// Reminder interval in minutes (default 45).
    pub interval_mins: u32,
}

impl Default for CustomBreakConfig {
    fn default() -> Self {
        Self { interval_mins: 45 }
    }
}

/// Combined break configuration for all modes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakConfig {
    /// Pomodoro-specific settings.
    pub pomodoro: PomodoroConfig,
    /// Custom-interval settings.
    pub custom: CustomBreakConfig,
    /// Whether to play a sound on break reminders.
    pub sound_enabled: bool,
    /// Minutes to delay when the user snoozes a break.
    pub snooze_mins: u32,
}

impl Default for BreakConfig {
    fn default() -> Self {
        Self {
            pomodoro: PomodoroConfig::default(),
            custom: CustomBreakConfig::default(),
            sound_enabled: true,
            snooze_mins: 5,
        }
    }
}

/// Persisted tracker state for crash recovery and frontend sync.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackerState {
    /// Current tracker status.
    pub status: TrackerStatus,
    /// ID of the current time entry (if active).
    pub time_entry_id: Option<String>,
    /// When the current session started (ISO 8601, UTC).
    pub started_at: Option<String>,
    /// When the session was paused (ISO 8601, UTC). `None` if not paused.
    pub paused_at: Option<String>,
    /// Accumulated pause intervals.
    pub pauses: Vec<Pause>,
    /// Running session notes (freeform markdown).
    pub notes: String,
    /// Timestamped session notes.
    pub session_notes: Vec<SessionNote>,
    /// Linked plan ID.
    pub linked_plan_id: Option<String>,
    /// Linked task ID.
    pub linked_task_id: Option<String>,
    /// Session category.
    pub category: Option<String>,
    /// Session tags.
    pub tags: Vec<String>,
    /// Break reminder mode.
    pub break_mode: BreakMode,
    /// Break reminder configuration.
    pub break_config: BreakConfig,
    /// Current Pomodoro work cycle count.
    pub pomodoro_cycle: u32,
    /// Elapsed seconds at which a snooze expires (backend-driven).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snooze_until_secs: Option<f64>,
    /// Elapsed seconds at which the current break ends (backend-driven).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub break_ends_at_secs: Option<f64>,
    /// Computed active minutes so far (for stopped sessions / detail form).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_mins: Option<i64>,
    /// End time (set on stop, for detail form display).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,
    /// Last update timestamp (for crash recovery gap detection).
    pub updated_at: String,
}

/// Input parameters for starting a tracking session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartTrackerInput {
    /// Workspace to track in.
    pub workspace_id: String,
    /// Optional plan to auto-link.
    pub linked_plan_id: Option<String>,
    /// Optional task to auto-link.
    pub linked_task_id: Option<String>,
    /// Optional initial category.
    pub category: Option<String>,
    /// Optional initial tags.
    pub tags: Option<Vec<String>>,
    /// Optional break mode to start with.
    pub break_mode: Option<String>,
}

/// Input parameters for saving a completed session's details.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveDetailInput {
    /// The time entry ID to finalize.
    pub time_entry_id: String,
    /// Updated summary notes.
    pub notes: Option<String>,
    /// Updated category.
    pub category: Option<String>,
    /// Updated tags.
    pub tags: Option<Vec<String>>,
    /// Link to plan.
    pub linked_plan_id: Option<String>,
    /// Link to task.
    pub linked_task_id: Option<String>,
    /// If set, create a task from this session.
    pub create_task: Option<CreateTaskFromSession>,
    /// If set, create a note from this session.
    pub create_note: Option<CreateNoteFromSession>,
}

/// Parameters for creating a task from a tracking session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskFromSession {
    /// Task title.
    pub title: String,
    /// Optional description.
    pub description: Option<String>,
}

/// Parameters for creating a note from a tracking session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateNoteFromSession {
    /// Note title.
    pub title: String,
    /// Optional folder to place the note in.
    pub folder: Option<String>,
}

/// A daily time summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailySummary {
    /// The date (YYYY-MM-DD).
    pub date: String,
    /// Total active minutes for the day.
    pub total_mins: i64,
    /// Number of completed time entries.
    pub entry_count: i64,
    /// Breakdown by category.
    pub by_category: Vec<CategoryTime>,
    /// Breakdown by tag.
    pub by_tag: Vec<TagTime>,
}

/// A weekly time summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeeklySummary {
    /// The Monday of the week (ISO date).
    pub week_start: String,
    /// The Sunday of the week (ISO date).
    pub week_end: String,
    /// Total active minutes for the week.
    pub total_mins: i64,
    /// Per-day breakdown.
    pub daily_breakdown: Vec<DailySummary>,
    /// Breakdown by category.
    pub by_category: Vec<CategoryTime>,
    /// Breakdown by tag.
    pub by_tag: Vec<TagTime>,
}

/// Time totals for a single category.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryTime {
    /// Category name (None for uncategorized entries).
    pub category: Option<String>,
    /// Total active minutes.
    pub total_mins: i64,
    /// Number of entries.
    pub entry_count: i64,
}

/// Time totals for a single tag.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagTime {
    /// Tag name.
    pub tag: String,
    /// Total active minutes.
    pub total_mins: i64,
    /// Number of entries.
    pub entry_count: i64,
}
