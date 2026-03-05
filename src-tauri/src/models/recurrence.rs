use serde::{Deserialize, Serialize};

/// The entity type a recurrence rule or reminder applies to.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RecurrenceEntityType {
    /// A task entity.
    Task,
    /// A plan entity.
    Plan,
}

impl RecurrenceEntityType {
    /// Returns the string representation used in the database.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Task => "task",
            Self::Plan => "plan",
        }
    }

    /// Parses from a database string value.
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "task" => Some(Self::Task),
            "plan" => Some(Self::Plan),
            _ => None,
        }
    }
}

/// The repeating pattern for a recurrence rule.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RecurrencePattern {
    /// Repeats every N days.
    Daily,
    /// Repeats every N weeks, optionally on specific days.
    Weekly,
    /// Repeats every N months on a specific day of the month.
    Monthly,
    /// Repeats every N years.
    Yearly,
    /// Custom pattern defined by days_of_week + interval.
    Custom,
}

impl RecurrencePattern {
    /// Returns the string representation used in the database.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Daily => "daily",
            Self::Weekly => "weekly",
            Self::Monthly => "monthly",
            Self::Yearly => "yearly",
            Self::Custom => "custom",
        }
    }

    /// Parses from a database string value.
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "daily" => Some(Self::Daily),
            "weekly" => Some(Self::Weekly),
            "monthly" => Some(Self::Monthly),
            "yearly" => Some(Self::Yearly),
            "custom" => Some(Self::Custom),
            _ => None,
        }
    }
}

/// A recurrence rule that defines a repeating schedule for tasks or plans.
///
/// Stored in the `recurrence_rules` table. Multiple task/plan occurrences
/// share the same rule, referenced via `recurrence_rule_id`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecurrenceRule {
    /// Unique identifier (UUID v7).
    pub id: String,
    /// The workspace this rule belongs to.
    pub workspace_id: String,
    /// Whether this rule applies to tasks or plans.
    pub entity_type: String,
    /// ID of the original (first) task or plan.
    pub parent_entity_id: String,
    /// The repeating pattern (daily, weekly, monthly, yearly, custom).
    pub pattern: String,
    /// Repeat every N periods.
    pub interval: u32,
    /// For weekly patterns: which days of the week (0=Sun..6=Sat).
    pub days_of_week: Option<Vec<u8>>,
    /// For monthly patterns: which day of the month (1-31).
    pub day_of_month: Option<u8>,
    /// For yearly patterns: which month (1-12).
    pub month_of_year: Option<u8>,
    /// Optional end date (ISO 8601). After this date, no more occurrences.
    pub end_date: Option<String>,
    /// Optional max occurrence count. After this many, no more occurrences.
    pub end_after_count: Option<u32>,
    /// How many occurrences have been generated so far.
    pub occurrences_created: u32,
    /// Pre-computed next occurrence date (ISO 8601 date).
    pub next_occurrence_date: Option<String>,
    /// Whether this rule is active (false = paused/stopped).
    pub is_active: bool,
    /// Creation timestamp.
    pub created_at: String,
    /// Last modification timestamp.
    pub updated_at: String,
}

/// Input for creating a new recurrence rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRecurrenceRuleInput {
    /// The workspace this rule belongs to.
    pub workspace_id: String,
    /// Whether this rule applies to tasks or plans.
    pub entity_type: String,
    /// ID of the original (first) task or plan.
    pub parent_entity_id: String,
    /// The repeating pattern.
    pub pattern: String,
    /// Repeat every N periods (defaults to 1).
    pub interval: Option<u32>,
    /// For weekly: which days of the week.
    pub days_of_week: Option<Vec<u8>>,
    /// For monthly: which day of the month.
    pub day_of_month: Option<u8>,
    /// For yearly: which month.
    pub month_of_year: Option<u8>,
    /// Optional end date.
    pub end_date: Option<String>,
    /// Optional max occurrence count.
    pub end_after_count: Option<u32>,
}

/// Input for updating an existing recurrence rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRecurrenceRuleInput {
    /// New pattern.
    pub pattern: Option<String>,
    /// New interval.
    pub interval: Option<u32>,
    /// New days of week (Some(None) clears).
    pub days_of_week: Option<Option<Vec<u8>>>,
    /// New day of month (Some(None) clears).
    pub day_of_month: Option<Option<u8>>,
    /// New month of year (Some(None) clears).
    pub month_of_year: Option<Option<u8>>,
    /// New end date (Some(None) clears).
    pub end_date: Option<Option<String>>,
    /// New end after count (Some(None) clears).
    pub end_after_count: Option<Option<u32>>,
    /// New active state.
    pub is_active: Option<bool>,
}

/// Summary of an entity occurrence in a recurrence chain.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntitySummary {
    /// Entity ID.
    pub id: String,
    /// Entity type (task or plan).
    pub entity_type: String,
    /// Entity title.
    pub title: String,
    /// Occurrence index within the chain.
    pub occurrence_index: Option<i64>,
    /// The date of this occurrence.
    pub date: Option<String>,
    /// Status (tasks only).
    pub status: Option<String>,
}
