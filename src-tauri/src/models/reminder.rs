use serde::{Deserialize, Serialize};

/// The type of offset for a reminder relative to the entity's reference time.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ReminderOffset {
    /// Remind at the exact due/start time.
    AtTime,
    /// Remind 15 minutes before.
    FifteenMinBefore,
    /// Remind 1 hour before.
    OneHourBefore,
    /// Remind 1 day before.
    OneDayBefore,
    /// Custom offset in minutes.
    Custom,
}

impl ReminderOffset {
    /// Returns the string representation used in the database.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::AtTime => "at_time",
            Self::FifteenMinBefore => "15min_before",
            Self::OneHourBefore => "1hr_before",
            Self::OneDayBefore => "1day_before",
            Self::Custom => "custom",
        }
    }

    /// Parses from a database string value.
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "at_time" => Some(Self::AtTime),
            "15min_before" => Some(Self::FifteenMinBefore),
            "1hr_before" => Some(Self::OneHourBefore),
            "1day_before" => Some(Self::OneDayBefore),
            "custom" => Some(Self::Custom),
            _ => None,
        }
    }

    /// Returns the offset in minutes for standard types (negative = before).
    pub fn offset_minutes(&self) -> i64 {
        match self {
            Self::AtTime => 0,
            Self::FifteenMinBefore => -15,
            Self::OneHourBefore => -60,
            Self::OneDayBefore => -1440,
            Self::Custom => 0, // use offset_mins field
        }
    }
}

/// A scheduled reminder for a task or plan.
///
/// Reminders fire at a computed `remind_at` time derived from an entity's
/// due date (tasks) or start time (plans) plus an offset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reminder {
    /// Unique identifier (UUID v7).
    pub id: String,
    /// The workspace this reminder belongs to.
    pub workspace_id: String,
    /// Whether this reminder is for a task or plan.
    pub entity_type: String,
    /// ID of the task or plan.
    pub entity_id: String,
    /// The absolute time when this reminder should fire (ISO 8601).
    pub remind_at: String,
    /// The type of offset used to compute remind_at.
    pub offset_type: String,
    /// Custom offset in minutes (for custom type).
    pub offset_mins: Option<i32>,
    /// Whether this reminder has already been fired.
    pub is_fired: bool,
    /// Whether the user has dismissed this reminder.
    pub is_dismissed: bool,
    /// Creation timestamp.
    pub created_at: String,
    /// Last modification timestamp.
    pub updated_at: String,
}

/// Input for creating a custom reminder.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReminderInput {
    /// The workspace this reminder belongs to.
    pub workspace_id: String,
    /// Whether this reminder is for a task or plan.
    pub entity_type: String,
    /// ID of the task or plan.
    pub entity_id: String,
    /// The type of offset.
    pub offset_type: String,
    /// Custom offset in minutes (for custom type).
    pub offset_mins: Option<i32>,
    /// The reference time to compute remind_at from (due_date or start_time).
    pub reference_time: String,
}

/// Input for updating an existing reminder.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateReminderInput {
    /// New offset type.
    pub offset_type: Option<String>,
    /// New custom offset minutes.
    pub offset_mins: Option<Option<i32>>,
    /// New reference time (recomputes remind_at).
    pub reference_time: Option<String>,
}

/// Global reminder preference defaults.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReminderDefaults {
    /// Default reminder offsets for task due dates.
    pub task_due: Vec<String>,
    /// Default reminder offsets for plan start times.
    pub plan_start: Vec<String>,
    /// Whether reminders are globally enabled.
    pub enabled: bool,
}

/// Configuration for auto-creating daily notes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoDailyNoteConfig {
    /// Whether auto-creation is enabled.
    pub enabled: bool,
    /// Template file name to use.
    pub template: String,
}
