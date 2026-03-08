use crate::models::template::Suggestion;

/// Generates task/plan suggestions when the time tracker stops.
///
/// Scores candidates from multiple signals and returns the top results.
///
/// Signals and weights:
/// - Scheduled today (0.4): Tasks with scheduled_date = today or plans with start_time today.
/// - Status in_progress (0.3): Tasks currently marked as in-progress.
/// - Tag overlap (0.15): Shared tags between tracker session and candidate.
/// - Title keyword match (0.1): Word overlap between tracker notes and candidate title.
/// - Recent activity (0.05): Candidates updated within the last 2 hours.
pub fn suggest_on_tracker_stop(
    conn: &rusqlite::Connection,
    workspace_id: &str,
    tracker_tags: &[String],
    tracker_notes: &str,
    stopped_at: &str,
) -> Result<Vec<Suggestion>, rusqlite::Error> {
    let today = if stopped_at.len() >= 10 { &stopped_at[..10] } else { return Ok(Vec::new()) };
    let mut suggestions: Vec<Suggestion> = Vec::new();
    let mut seen_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    let tracker_words: Vec<String> = tracker_notes
        .to_lowercase()
        .split_whitespace()
        .filter(|w| w.len() > 2)
        .map(|s| s.to_string())
        .collect();

    // 1. Tasks scheduled for today or in_progress
    let mut stmt = conn.prepare(
        "SELECT id, title, status, scheduled_date, tags, updated_at
         FROM tasks
         WHERE workspace_id = ?1
           AND deleted_at IS NULL
           AND status NOT IN ('done', 'cancelled')
           AND (scheduled_date = ?2 OR status = 'in_progress')
         ORDER BY updated_at DESC
         LIMIT 20",
    )?;

    let tasks = stmt.query_map(rusqlite::params![workspace_id, today], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, String>(5)?,
        ))
    })?;

    for task in tasks {
        let (id, title, status, scheduled_date, tags_str, updated_at) = task?;
        if seen_ids.contains(&id) {
            continue;
        }

        let mut score = 0.0;
        let mut reasons: Vec<&str> = Vec::new();

        // Scheduled today
        if scheduled_date.as_deref() == Some(today) {
            score += 0.4;
            reasons.push("Scheduled for today");
        }

        // In progress
        if status == "in_progress" {
            score += 0.3;
            reasons.push("Currently in progress");
        }

        // Tag overlap
        let task_tags = parse_tags(&tags_str);
        let overlap = tag_overlap(tracker_tags, &task_tags);
        if overlap > 0 {
            score += 0.15 * (overlap as f64 / std::cmp::max(tracker_tags.len(), 1) as f64);
            reasons.push("Matching tags");
        }

        // Title keyword match
        let keyword_score = keyword_match(&tracker_words, &title);
        if keyword_score > 0.0 {
            score += 0.1 * keyword_score;
            reasons.push("Keyword match");
        }

        // Recent activity
        if is_recent(&updated_at, stopped_at) {
            score += 0.05;
            reasons.push("Recently updated");
        }

        if score > 0.0 {
            seen_ids.insert(id.clone());
            suggestions.push(Suggestion {
                entity_type: "task".to_string(),
                entity_id: id,
                title,
                score,
                reason: reasons.join(", "),
            });
        }
    }

    // 2. Plans within today
    let mut stmt = conn.prepare(
        "SELECT id, title, start_time, tags, updated_at
         FROM plans
         WHERE workspace_id = ?1
           AND deleted_at IS NULL
           AND start_time >= ?2
           AND start_time < ?2 || 'T23:59:59'
         ORDER BY start_time ASC
         LIMIT 10",
    )?;

    let plans = stmt.query_map(rusqlite::params![workspace_id, today], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?;

    for plan in plans {
        let (id, title, _start_time, tags_str, updated_at) = plan?;
        if seen_ids.contains(&id) {
            continue;
        }

        let mut score = 0.4; // Today's plan base score
        let mut reasons: Vec<&str> = vec!["Today's calendar event"];

        // Tag overlap
        let plan_tags = parse_tags(&tags_str);
        let overlap = tag_overlap(tracker_tags, &plan_tags);
        if overlap > 0 {
            score += 0.15 * (overlap as f64 / std::cmp::max(tracker_tags.len(), 1) as f64);
            reasons.push("Matching tags");
        }

        // Title keyword match
        let keyword_score = keyword_match(&tracker_words, &title);
        if keyword_score > 0.0 {
            score += 0.1 * keyword_score;
            reasons.push("Keyword match");
        }

        // Recent activity
        if is_recent(&updated_at, stopped_at) {
            score += 0.05;
        }

        seen_ids.insert(id.clone());
        suggestions.push(Suggestion {
            entity_type: "plan".to_string(),
            entity_id: id,
            title,
            score,
            reason: reasons.join(", "),
        });
    }

    // 3. Tasks with matching tags (not already included)
    if !tracker_tags.is_empty() {
        let mut stmt = conn.prepare(
            "SELECT id, title, status, scheduled_date, tags, updated_at
             FROM tasks
             WHERE workspace_id = ?1
               AND deleted_at IS NULL
               AND status NOT IN ('done', 'cancelled')
             ORDER BY updated_at DESC
             LIMIT 30",
        )?;

        let tasks = stmt.query_map(rusqlite::params![workspace_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?,
            ))
        })?;

        for task in tasks {
            let (id, title, _status, _scheduled_date, tags_str, updated_at) = task?;
            if seen_ids.contains(&id) {
                continue;
            }

            let task_tags = parse_tags(&tags_str);
            let overlap = tag_overlap(tracker_tags, &task_tags);
            if overlap > 0 {
                let mut score =
                    0.15 * (overlap as f64 / std::cmp::max(tracker_tags.len(), 1) as f64);

                let keyword_score = keyword_match(&tracker_words, &title);
                score += 0.1 * keyword_score;

                if is_recent(&updated_at, stopped_at) {
                    score += 0.05;
                }

                seen_ids.insert(id.clone());
                suggestions.push(Suggestion {
                    entity_type: "task".to_string(),
                    entity_id: id,
                    title,
                    score,
                    reason: "Matching tags".to_string(),
                });
            }
        }
    }

    // Sort by score descending, cap at 10
    suggestions.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    suggestions.truncate(10);

    Ok(suggestions)
}

/// Parses a JSON tags string into a vector of tag strings.
fn parse_tags(tags_str: &Option<String>) -> Vec<String> {
    tags_str
        .as_deref()
        .and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
        .unwrap_or_default()
}

/// Counts the number of overlapping tags between two sets.
fn tag_overlap(a: &[String], b: &[String]) -> usize {
    a.iter()
        .filter(|tag| b.iter().any(|t| t.to_lowercase() == tag.to_lowercase()))
        .count()
}

/// Calculates a keyword match score (0.0 - 1.0) between words and a title.
fn keyword_match(words: &[String], title: &str) -> f64 {
    if words.is_empty() {
        return 0.0;
    }

    let title_lower = title.to_lowercase();
    let matching = words.iter().filter(|w| title_lower.contains(w.as_str())).count();

    matching as f64 / words.len() as f64
}

/// Checks if an updated_at timestamp is within 2 hours of the stopped_at time.
fn is_recent(updated_at: &str, stopped_at: &str) -> bool {
    // Simple string comparison for timestamps close to each other
    // Both are ISO 8601 format, so lexicographic comparison works for "within 2 hours"
    if updated_at.len() < 19 || stopped_at.len() < 19 {
        return false;
    }

    if let (Ok(updated), Ok(stopped)) = (
        chrono::NaiveDateTime::parse_from_str(&updated_at[..19], "%Y-%m-%dT%H:%M:%S"),
        chrono::NaiveDateTime::parse_from_str(&stopped_at[..19], "%Y-%m-%dT%H:%M:%S"),
    ) {
        let diff = stopped.signed_duration_since(updated);
        diff.num_hours().abs() <= 2
    } else {
        false
    }
}
