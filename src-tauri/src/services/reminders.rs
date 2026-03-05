use crate::models::reminder::{ReminderDefaults, ReminderOffset};

/// Computes the absolute `remind_at` time from a reference time and offset.
///
/// The reference time is the entity's due_date (tasks) or start_time (plans).
/// The offset is subtracted from the reference time to get the reminder time.
///
/// Output format matches `now_iso()` (RFC 3339) for reliable SQL string comparison.
pub fn compute_remind_at(
    reference_time: &str,
    offset_type: &str,
    custom_mins: Option<i32>,
) -> Result<String, String> {
    let offset = ReminderOffset::parse(offset_type)
        .ok_or_else(|| format!("Invalid offset type: {}", offset_type))?;

    let offset_mins = match offset {
        ReminderOffset::Custom => custom_mins.unwrap_or(0),
        _ => offset.offset_minutes() as i32,
    };

    let duration = chrono::Duration::minutes(i64::from(offset_mins));

    // Try RFC 3339 first — handles "2026-03-05T11:00:00.000Z", "...+00:00", etc.
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(reference_time) {
        let remind_dt = dt.with_timezone(&chrono::Utc) + duration;
        return Ok(remind_dt.to_rfc3339());
    }

    // Try naive datetime (no timezone info)
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(reference_time, "%Y-%m-%dT%H:%M:%S") {
        let remind_dt = dt + duration;
        return Ok(remind_dt.format("%Y-%m-%dT%H:%M:%S").to_string());
    }

    // Try naive with fractional seconds
    if let Ok(dt) =
        chrono::NaiveDateTime::parse_from_str(reference_time, "%Y-%m-%dT%H:%M:%S%.f")
    {
        let remind_dt = dt + duration;
        return Ok(remind_dt.format("%Y-%m-%dT%H:%M:%S").to_string());
    }

    // Try date-only (assume start of day)
    if let Ok(d) = chrono::NaiveDate::parse_from_str(reference_time, "%Y-%m-%d") {
        let dt = d
            .and_hms_opt(0, 0, 0)
            .ok_or("Invalid time")?;
        let remind_dt = dt + duration;
        return Ok(remind_dt.format("%Y-%m-%dT%H:%M:%S").to_string());
    }

    Err(format!(
        "Could not parse reference time: {}",
        reference_time
    ))
}

/// Parses reminder defaults from a JSON settings string.
pub fn parse_defaults(json_str: &str) -> Result<ReminderDefaults, String> {
    serde_json::from_str(json_str).map_err(|e| e.to_string())
}

/// Serializes reminder defaults to a JSON string for storage.
pub fn serialize_defaults(defaults: &ReminderDefaults) -> Result<String, String> {
    serde_json::to_string(defaults).map_err(|e| e.to_string())
}
