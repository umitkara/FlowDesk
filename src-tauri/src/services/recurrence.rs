use chrono::{Datelike, NaiveDate};

/// Computes the next occurrence date from a recurrence pattern.
///
/// Returns `None` if the rule is exhausted (end_date or end_after_count reached).
///
/// # Arguments
/// * `pattern` - The recurrence pattern (daily, weekly, monthly, yearly, custom)
/// * `interval` - Every N periods
/// * `from_date` - The date to compute the next occurrence from
/// * `days_of_week` - For weekly/custom: which days (0=Sun..6=Sat)
/// * `day_of_month` - For monthly: which day (1-31)
/// * `month_of_year` - For yearly: which month (1-12)
/// * `end_date` - Optional end date
/// * `end_after_count` - Optional max occurrence count
/// * `occurrences_created` - How many have been created so far
#[allow(clippy::too_many_arguments)]
pub fn compute_next_date(
    pattern: &str,
    interval: u32,
    from_date: &NaiveDate,
    days_of_week: &Option<Vec<u8>>,
    day_of_month: Option<u8>,
    month_of_year: Option<u8>,
    end_date: &Option<String>,
    end_after_count: Option<u32>,
    occurrences_created: u32,
) -> Option<NaiveDate> {
    if interval == 0 {
        return None;
    }

    // Check end_after_count first
    if let Some(max) = end_after_count {
        if occurrences_created >= max {
            return None;
        }
    }

    let candidate = match pattern {
        "daily" => compute_daily(from_date, interval),
        "weekly" => compute_weekly(from_date, interval, days_of_week),
        "monthly" => compute_monthly(from_date, interval, day_of_month),
        "yearly" => compute_yearly(from_date, interval, day_of_month, month_of_year),
        "custom" => compute_weekly(from_date, interval, days_of_week),
        _ => return None,
    };

    let candidate = candidate?;

    // Check end_date
    if let Some(end) = end_date {
        if let Ok(end_d) = NaiveDate::parse_from_str(end, "%Y-%m-%d") {
            if candidate > end_d {
                return None;
            }
        }
    }

    Some(candidate)
}

/// Computes the next daily occurrence.
fn compute_daily(from_date: &NaiveDate, interval: u32) -> Option<NaiveDate> {
    from_date.checked_add_signed(chrono::Duration::days(i64::from(interval)))
}

/// Computes the next weekly occurrence.
///
/// If `days_of_week` is specified, finds the next matching day in the list
/// after `from_date`'s weekday. If no more days this week, jumps to the
/// first day of the next qualifying week.
fn compute_weekly(
    from_date: &NaiveDate,
    interval: u32,
    days_of_week: &Option<Vec<u8>>,
) -> Option<NaiveDate> {
    match days_of_week {
        Some(days) if !days.is_empty() => {
            let current_dow = from_date.format("%w").to_string().parse::<u8>().unwrap_or(0);

            // Find the next day in the list after current day in the same week
            let mut sorted_days = days.clone();
            sorted_days.sort_unstable();

            // Look for next day in current week (same interval period)
            for &day in &sorted_days {
                if day > current_dow {
                    let diff = i64::from(day) - i64::from(current_dow);
                    return from_date.checked_add_signed(chrono::Duration::days(diff));
                }
            }

            // No more days this week, jump to first day of next qualifying week
            let first_day = sorted_days[0];
            let days_until_next_week = 7 - i64::from(current_dow) + i64::from(first_day);
            let extra_weeks = (i64::from(interval) - 1) * 7;
            from_date.checked_add_signed(chrono::Duration::days(days_until_next_week + extra_weeks))
        }
        _ => {
            // No specific days, just jump N weeks
            from_date.checked_add_signed(chrono::Duration::weeks(i64::from(interval)))
        }
    }
}

/// Computes the next monthly occurrence.
///
/// Clamps the target day to the month's maximum (e.g., Jan 31 -> Feb 28).
fn compute_monthly(
    from_date: &NaiveDate,
    interval: u32,
    day_of_month: Option<u8>,
) -> Option<NaiveDate> {
    let target_day = day_of_month.unwrap_or(from_date.day() as u8);

    let from_month = from_date.month();
    let from_year = from_date.year();

    let total_months = from_month as i32 - 1 + interval as i32;
    let candidate_year = from_year + total_months / 12;
    let candidate_month = ((total_months % 12) + 1) as u32;

    let max_day = days_in_month(candidate_year, candidate_month);
    let actual_day = std::cmp::min(u32::from(target_day), max_day);

    NaiveDate::from_ymd_opt(candidate_year, candidate_month, actual_day)
}

/// Computes the next yearly occurrence.
///
/// Handles leap year edge cases (Feb 29 -> Feb 28 in non-leap years).
fn compute_yearly(
    from_date: &NaiveDate,
    interval: u32,
    day_of_month: Option<u8>,
    month_of_year: Option<u8>,
) -> Option<NaiveDate> {
    let target_month = u32::from(month_of_year.unwrap_or(from_date.month() as u8));
    let target_day = u32::from(day_of_month.unwrap_or(from_date.day() as u8));

    let candidate_year = from_date.year() + interval as i32;
    let max_day = days_in_month(candidate_year, target_month);
    let actual_day = std::cmp::min(target_day, max_day);

    NaiveDate::from_ymd_opt(candidate_year, target_month, actual_day)
}

/// Returns the number of days in a given month/year.
fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

/// Returns true if the given year is a leap year.
fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

/// Checks if a recurrence rule has reached its end condition.
pub fn is_exhausted(
    end_date: &Option<String>,
    end_after_count: Option<u32>,
    occurrences_created: u32,
    next_occurrence_date: &Option<String>,
) -> bool {
    if let Some(max) = end_after_count {
        if occurrences_created >= max {
            return true;
        }
    }

    if let (Some(end), Some(next)) = (end_date, next_occurrence_date) {
        if let (Ok(end_d), Ok(next_d)) = (
            NaiveDate::parse_from_str(end, "%Y-%m-%d"),
            NaiveDate::parse_from_str(next, "%Y-%m-%d"),
        ) {
            if next_d > end_d {
                return true;
            }
        }
    }

    false
}

/// Adjusts a due date to maintain the same offset from the scheduled date.
///
/// If the original task had scheduled=Mon, due=Wed (2 days offset),
/// and the new scheduled date is next Mon, the new due date is next Wed.
pub fn adjust_due_date(
    original_due: &Option<String>,
    original_scheduled: &Option<String>,
    new_scheduled: &NaiveDate,
) -> Option<String> {
    let due = original_due.as_ref()?;
    let scheduled = original_scheduled.as_ref()?;

    let due_d = NaiveDate::parse_from_str(due, "%Y-%m-%d").ok()?;
    let sched_d = NaiveDate::parse_from_str(scheduled, "%Y-%m-%d").ok()?;

    let offset = due_d.signed_duration_since(sched_d).num_days();
    let new_due = new_scheduled.checked_add_signed(chrono::Duration::days(offset))?;

    Some(new_due.format("%Y-%m-%d").to_string())
}

/// Shifts a datetime string to a new date while preserving the time component.
///
/// Used for plan recurrence: if the original plan was 9:00-10:00 on Monday,
/// the next occurrence keeps the same time on the next Monday.
pub fn shift_datetime(original_datetime: &str, new_date: &NaiveDate) -> String {
    // Try to parse as ISO 8601 datetime and extract time portion
    if let Some(time_part) = original_datetime.split('T').nth(1) {
        format!("{}T{}", new_date.format("%Y-%m-%d"), time_part)
    } else {
        // No time component, just use the date
        new_date.format("%Y-%m-%d").to_string()
    }
}
