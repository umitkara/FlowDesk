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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn at_time_offset() {
        let result = compute_remind_at("2026-03-09T10:00:00+00:00", "at_time", None).unwrap();
        assert!(result.contains("2026-03-09T10:00:00"));
    }

    #[test]
    fn fifteen_min_before() {
        let result = compute_remind_at("2026-03-09T10:00:00+00:00", "15min_before", None).unwrap();
        assert!(result.contains("09:45:00"));
    }

    #[test]
    fn one_hour_before() {
        let result = compute_remind_at("2026-03-09T10:00:00+00:00", "1hr_before", None).unwrap();
        assert!(result.contains("09:00:00"));
    }

    #[test]
    fn one_day_before() {
        let result = compute_remind_at("2026-03-09T10:00:00+00:00", "1day_before", None).unwrap();
        assert!(result.contains("2026-03-08T10:00:00"));
    }

    #[test]
    fn custom_offset() {
        let result = compute_remind_at("2026-03-09T10:00:00+00:00", "custom", Some(-45)).unwrap();
        assert!(result.contains("09:15:00"));
    }

    #[test]
    fn invalid_offset_type() {
        let result = compute_remind_at("2026-03-09T10:00:00+00:00", "bogus", None);
        assert!(result.is_err());
    }

    #[test]
    fn date_only_input() {
        let result = compute_remind_at("2026-03-09", "15min_before", None).unwrap();
        assert!(result.contains("2026-03-08T23:45:00"));
    }

    #[test]
    fn defaults_roundtrip() {
        let defaults = ReminderDefaults {
            task_due: vec!["15min_before".to_string()],
            plan_start: vec!["1hr_before".to_string()],
            enabled: true,
        };
        let json = serialize_defaults(&defaults).unwrap();
        let parsed = parse_defaults(&json).unwrap();
        assert_eq!(parsed.task_due, defaults.task_due);
        assert_eq!(parsed.enabled, true);
    }
}
