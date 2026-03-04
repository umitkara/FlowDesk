use chrono::Utc;

/// Returns the current UTC time as an ISO 8601 / RFC 3339 string.
pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

/// Returns today's date in `YYYY-MM-DD` format (UTC).
pub fn today_iso() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}
