use crate::models::discovery::{
    ActualEntry, BacklinkWithContext, FacetedSearchResponse, FilterConfig, GraphData, GraphQuery,
    GroupEntry, GroupedViewResult, PlannedBlock, PlannedVsActualData, UnplannedGroup,
};
use crate::models::time_entry::Pause;
use crate::services::faceted_search::execute_faceted_search;
use crate::services::graph::compute_graph;
use crate::services::tracker::calculate_active_mins;
use crate::state::AppState;
use crate::utils::errors::AppError;
use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use std::collections::{HashMap, HashSet};
use tauri::State;

/// Performs a multi-entity faceted search with filter configuration.
///
/// Returns ranked results along with facet counts for each dimension
/// (entity type, category, tags, status, priority, importance).
#[tauri::command]
pub fn faceted_search(
    state: State<'_, AppState>,
    workspace_id: String,
    filter: FilterConfig,
) -> Result<FacetedSearchResponse, AppError> {
    state
        .db
        .with_conn(|conn| execute_faceted_search(conn, &workspace_id, &filter))
        .map_err(AppError::Database)
}

/// Retrieves graph data (nodes and edges) for entity relationship visualization.
///
/// Supports centered BFS (focus on a specific entity) and full workspace graphs.
/// Results are capped at max_nodes for performance.
#[tauri::command]
pub fn get_graph_data(
    state: State<'_, AppState>,
    query: GraphQuery,
) -> Result<GraphData, AppError> {
    state
        .db
        .with_conn(|conn| compute_graph(conn, &query))
        .map_err(AppError::Database)
}

/// Returns entities grouped by a specified field.
///
/// Groups entities (notes, tasks, or plans) by a field such as category,
/// type, importance, status, or a custom front matter field.
#[tauri::command]
pub fn get_grouped_view(
    state: State<'_, AppState>,
    workspace_id: String,
    entity_type: String,
    group_by: String,
    filter: Option<FilterConfig>,
) -> Result<GroupedViewResult, AppError> {
    state
        .db
        .with_conn(|conn| {
            // First get all entities of the type using faceted search
            let mut search_filter = filter.unwrap_or_default();
            search_filter.entity_types = Some(vec![entity_type.clone()]);
            search_filter.limit = Some(1000); // reasonable cap for grouping

            let response = execute_faceted_search(conn, &workspace_id, &search_filter)?;

            // Group results by the specified field
            let mut groups: std::collections::HashMap<
                String,
                Vec<crate::models::discovery::FacetedSearchResult>,
            > = std::collections::HashMap::new();

            for result in response.results {
                let key = match group_by.as_str() {
                    "category" => {
                        result.category.clone().unwrap_or_else(|| "(none)".to_string())
                    }
                    "status" => {
                        result.status.clone().unwrap_or_else(|| "(none)".to_string())
                    }
                    "priority" => {
                        result.priority.clone().unwrap_or_else(|| "(none)".to_string())
                    }
                    "importance" => {
                        result
                            .importance
                            .clone()
                            .unwrap_or_else(|| "(none)".to_string())
                    }
                    "folder" => {
                        result.folder.clone().unwrap_or_else(|| "(none)".to_string())
                    }
                    "note_type" if entity_type == "note" => {
                        conn.query_row(
                            "SELECT type FROM notes WHERE id = ?1",
                            [&result.id],
                            |row| row.get::<_, Option<String>>(0),
                        )
                        .unwrap_or(None)
                        .unwrap_or_else(|| "(none)".to_string())
                    }
                    "type" if entity_type == "plan" => {
                        conn.query_row(
                            "SELECT type FROM plans WHERE id = ?1",
                            [&result.id],
                            |row| row.get::<_, Option<String>>(0),
                        )
                        .unwrap_or(None)
                        .unwrap_or_else(|| "(none)".to_string())
                    }
                    "entity_type" => result.entity_type.clone(),
                    field if field.starts_with("front_matter.") => {
                        let fm_field = &field["front_matter.".len()..];
                        // Sanitize: only allow alphanumeric and underscore in field names
                        if entity_type == "note"
                            && !fm_field.is_empty()
                            && fm_field
                                .chars()
                                .all(|c| c.is_alphanumeric() || c == '_')
                        {
                            conn.query_row(
                                "SELECT json_extract(front_matter, ?1) FROM notes WHERE id = ?2",
                                rusqlite::params![format!("$.{}", fm_field), result.id],
                                |row| row.get::<_, Option<String>>(0),
                            )
                            .unwrap_or(None)
                            .unwrap_or_else(|| "(none)".to_string())
                        } else {
                            "(none)".to_string()
                        }
                    }
                    _ => "(unknown)".to_string(),
                };

                groups.entry(key).or_default().push(result);
            }

            // Convert to sorted group entries
            let mut group_entries: Vec<GroupEntry> = groups
                .into_iter()
                .map(|(key, items)| GroupEntry {
                    count: items.len() as i64,
                    key,
                    items,
                })
                .collect();

            group_entries.sort_by(|a, b| a.key.cmp(&b.key));

            Ok(GroupedViewResult {
                groups: group_entries,
            })
        })
        .map_err(AppError::Database)
}

/// Returns planned vs actual comparison data for a single day.
///
/// Compares plan blocks (time_block type) with actual time entries
/// for the given date, computing totals and difference.
#[tauri::command]
pub fn get_planned_vs_actual(
    state: State<'_, AppState>,
    workspace_id: String,
    date: String,
) -> Result<PlannedVsActualData, AppError> {
    state
        .db
        .with_conn(|conn| compute_planned_vs_actual(conn, &workspace_id, &date))
        .map_err(AppError::Database)
}

/// Returns planned vs actual data for a range of dates.
#[tauri::command]
pub fn get_planned_vs_actual_range(
    state: State<'_, AppState>,
    workspace_id: String,
    date_from: String,
    date_to: String,
) -> Result<Vec<PlannedVsActualData>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut results = Vec::new();
            let mut current = date_from.clone();
            while current <= date_to {
                let data = compute_planned_vs_actual(conn, &workspace_id, &current)?;
                results.push(data);
                current = increment_date(&current);
            }
            Ok(results)
        })
        .map_err(AppError::Database)
}

/// Returns backlinks with surrounding context snippets for an entity.
///
/// For each reference pointing to the target entity, loads the source entity's
/// body and extracts the surrounding text where the reference appears.
#[tauri::command]
pub fn get_backlinks_with_context(
    state: State<'_, AppState>,
    entity_type: String,
    entity_id: String,
) -> Result<Vec<BacklinkWithContext>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT r.id, r.source_type, r.source_id, r.relation
                 FROM refs r
                 WHERE r.target_type = ?1 AND r.target_id = ?2",
            )?;

            let refs: Vec<(String, String, String, String)> = stmt
                .query_map(rusqlite::params![entity_type, entity_id], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;

            let mut backlinks = Vec::new();

            for (ref_id, source_type, source_id, relation) in refs {
                let (title, body, updated_at) = match source_type.as_str() {
                    "note" => conn
                        .query_row(
                            "SELECT COALESCE(title, 'Untitled'), body, updated_at FROM notes WHERE id = ?1",
                            [&source_id],
                            |row| {
                                Ok((
                                    row.get(0)?,
                                    row.get::<_, Option<String>>(1)?,
                                    row.get(2)?,
                                ))
                            },
                        )
                        .unwrap_or(("Unknown".to_string(), None, String::new())),
                    "task" => conn
                        .query_row(
                            "SELECT title, description, updated_at FROM tasks WHERE id = ?1",
                            [&source_id],
                            |row| {
                                Ok((
                                    row.get(0)?,
                                    row.get::<_, Option<String>>(1)?,
                                    row.get(2)?,
                                ))
                            },
                        )
                        .unwrap_or(("Unknown".to_string(), None, String::new())),
                    "plan" => conn
                        .query_row(
                            "SELECT title, description, updated_at FROM plans WHERE id = ?1",
                            [&source_id],
                            |row| {
                                Ok((
                                    row.get(0)?,
                                    row.get::<_, Option<String>>(1)?,
                                    row.get(2)?,
                                ))
                            },
                        )
                        .unwrap_or(("Unknown".to_string(), None, String::new())),
                    _ => continue,
                };

                let context = extract_reference_context(
                    body.as_deref().unwrap_or(""),
                    &entity_id,
                    &entity_type,
                );

                backlinks.push(BacklinkWithContext {
                    reference_id: ref_id,
                    source_type,
                    source_id,
                    source_title: title,
                    relation,
                    context_snippet: context,
                    source_updated_at: updated_at,
                });
            }

            Ok(backlinks)
        })
        .map_err(AppError::Database)
}

/// Extracts surrounding context text around a reference in the body.
fn extract_reference_context(body: &str, entity_id: &str, entity_type: &str) -> String {
    let pattern = format!("@{}[{}]", entity_type, entity_id);
    if let Some(pos) = body.find(&pattern) {
        let start = pos.saturating_sub(100);
        let end = std::cmp::min(pos + pattern.len() + 100, body.len());

        let mut snippet = body[start..end].to_string();

        if start > 0 {
            if let Some(space) = snippet.find(' ') {
                snippet = format!("...{}", &snippet[space..]);
            }
        }
        if end < body.len() {
            if let Some(space) = snippet.rfind(' ') {
                snippet = format!("{}...", &snippet[..space]);
            }
        }

        return snippet.trim().to_string();
    }

    if body.len() > 200 {
        let end = body
            .char_indices()
            .nth(200)
            .map(|(i, _)| i)
            .unwrap_or(body.len());
        format!("{}...", &body[..end])
    } else {
        body.to_string()
    }
}

/// Parses a timestamp string into NaiveDateTime.
/// Handles RFC 3339 (with Z or +00:00) and plain ISO (no timezone).
fn parse_naive_datetime(s: &str) -> Option<NaiveDateTime> {
    // Try RFC 3339 first (e.g. "2024-01-15T09:00:00Z" or "2024-01-15T09:00:00+00:00")
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.naive_utc());
    }
    // Try plain ISO without timezone
    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        return Some(dt);
    }
    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f") {
        return Some(dt);
    }
    None
}

/// Clamps an interval to a day window [day_start, day_end) and returns minutes.
fn clamp_duration_to_day(start: NaiveDateTime, end: NaiveDateTime, day_start: NaiveDateTime, day_end: NaiveDateTime) -> i64 {
    let clamped_start = start.max(day_start);
    let clamped_end = end.min(day_end);
    if clamped_end <= clamped_start {
        return 0;
    }
    (clamped_end - clamped_start).num_minutes()
}

/// Pro-rates active_mins proportionally to the day fraction for cross-midnight entries.
fn prorate_active_mins(active_mins: i64, total_start: NaiveDateTime, total_end: NaiveDateTime, day_start: NaiveDateTime, day_end: NaiveDateTime) -> i64 {
    let total_span = (total_end - total_start).num_minutes();
    if total_span <= 0 {
        return active_mins;
    }
    let day_span = clamp_duration_to_day(total_start, total_end, day_start, day_end);
    let fraction = day_span as f64 / total_span as f64;
    (active_mins as f64 * fraction).round() as i64
}

/// Computes planned vs actual data for a single date.
fn compute_planned_vs_actual(
    conn: &rusqlite::Connection,
    workspace_id: &str,
    date: &str,
) -> Result<PlannedVsActualData, rusqlite::Error> {
    let naive_date = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .unwrap_or_else(|_| NaiveDate::from_ymd_opt(2000, 1, 1).unwrap());
    let day_start = naive_date.and_time(NaiveTime::from_hms_opt(0, 0, 0).unwrap());
    let day_end = naive_date.and_time(NaiveTime::from_hms_opt(23, 59, 59).unwrap());

    let date_start_str = format!("{}T00:00:00", date);
    let date_end_str = format!("{}T23:59:59", date);

    // Query plans that OVERLAP with the day (not just start within it)
    let mut plan_stmt = conn.prepare(
        "SELECT id, title, start_time, end_time, color, type
         FROM plans
         WHERE workspace_id = ?1
           AND start_time < ?2 AND end_time > ?3
           AND deleted_at IS NULL
           AND type IN ('time_block', 'event', 'meeting', 'review')
         ORDER BY start_time ASC",
    )?;

    let raw_plans: Vec<(String, String, String, String, Option<String>, String)> = plan_stmt
        .query_map(
            rusqlite::params![workspace_id, date_end_str, date_start_str],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get::<_, Option<String>>(5)?.unwrap_or_else(|| "time_block".to_string()),
                ))
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;

    let mut planned_blocks: Vec<PlannedBlock> = Vec::new();
    for (plan_id, title, start_str, end_str, color, plan_type) in &raw_plans {
        let start_dt = match parse_naive_datetime(start_str) {
            Some(dt) => dt,
            None => continue,
        };
        let end_dt = match parse_naive_datetime(end_str) {
            Some(dt) => dt,
            None => continue,
        };
        let duration_mins = clamp_duration_to_day(start_dt, end_dt, day_start, day_end);
        if duration_mins <= 0 {
            continue;
        }
        planned_blocks.push(PlannedBlock {
            plan_id: plan_id.clone(),
            title: title.clone(),
            start_time: start_str.clone(),
            end_time: end_str.clone(),
            duration_mins,
            color: color.clone(),
            plan_type: plan_type.clone(),
            linked_entries: Vec::new(),
            actual_mins: 0,
            variance_mins: 0,
        });
    }

    // Query time entries that OVERLAP with the day OR are running (end_time IS NULL)
    let mut entry_stmt = conn.prepare(
        "SELECT id, start_time, end_time, active_mins, category,
                linked_plan_id, linked_task_id, notes, pauses
         FROM time_entries
         WHERE workspace_id = ?1
           AND deleted_at IS NULL
           AND (
             (start_time < ?2 AND (end_time > ?3 OR end_time IS NULL))
           )
         ORDER BY start_time ASC",
    )?;

    let now_utc = Utc::now().naive_utc();

    let mut actual_entries: Vec<ActualEntry> = Vec::new();
    let mut entry_rows = entry_stmt.query(
        rusqlite::params![workspace_id, date_end_str, date_start_str],
    )?;

    while let Some(row) = entry_rows.next()? {
        let entry_id: String = row.get(0)?;
        let start_str: String = row.get(1)?;
        let end_str_opt: Option<String> = row.get(2)?;
        let stored_active_mins: Option<i64> = row.get(3)?;
        let category: Option<String> = row.get(4)?;
        let linked_plan_id: Option<String> = row.get(5)?;
        let linked_task_id: Option<String> = row.get(6)?;
        let notes: Option<String> = row.get(7)?;
        let pauses_json: Option<String> = row.get(8)?;

        let in_progress = end_str_opt.is_none();

        let start_dt = match parse_naive_datetime(&start_str) {
            Some(dt) => dt,
            None => continue,
        };

        // For running entries, compute live active_mins
        let (effective_end_str, active_mins) = if in_progress {
            let pauses: Vec<Pause> = pauses_json
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default();
            let now_rfc = Utc::now().to_rfc3339();
            let live_mins = calculate_active_mins(&start_str, &now_rfc, &pauses);
            (now_rfc, live_mins)
        } else {
            let end_s = end_str_opt.clone().unwrap_or_default();
            let mins = stored_active_mins.unwrap_or(0);
            (end_s, mins)
        };

        let end_dt = parse_naive_datetime(&effective_end_str).unwrap_or(now_utc);

        // Pro-rate active_mins to day window for cross-midnight entries
        let clamped_mins = prorate_active_mins(active_mins, start_dt, end_dt, day_start, day_end);
        if clamped_mins <= 0 && !in_progress {
            continue;
        }

        let preview = notes.map(|n| {
            if n.len() > 100 {
                let boundary = n.floor_char_boundary(100);
                format!("{}...", &n[..boundary])
            } else {
                n
            }
        });

        actual_entries.push(ActualEntry {
            time_entry_id: entry_id,
            start_time: start_str,
            end_time: effective_end_str,
            active_mins: clamped_mins,
            category,
            linked_plan_id,
            linked_task_id,
            notes_preview: preview,
            in_progress,
        });
    }

    // --- Correlation ---
    // Build a map of plan_id -> list of entries linked to that plan
    let plan_ids: HashSet<&str> = planned_blocks.iter().map(|b| b.plan_id.as_str()).collect();
    let mut entries_by_plan: HashMap<String, Vec<ActualEntry>> = HashMap::new();
    let mut unlinked_entries: Vec<ActualEntry> = Vec::new();

    for entry in &actual_entries {
        if let Some(ref pid) = entry.linked_plan_id {
            if plan_ids.contains(pid.as_str()) {
                entries_by_plan.entry(pid.clone()).or_default().push(entry.clone());
                continue;
            }
        }
        unlinked_entries.push(entry.clone());
    }

    // Matched: plans that have at least one linked entry
    let mut matched: Vec<PlannedBlock> = Vec::new();
    let mut missed: Vec<PlannedBlock> = Vec::new();
    for mut block in planned_blocks.clone() {
        if let Some(linked) = entries_by_plan.remove(&block.plan_id) {
            let actual_total: i64 = linked.iter().map(|e| e.active_mins).sum();
            block.linked_entries = linked;
            block.actual_mins = actual_total;
            block.variance_mins = actual_total - block.duration_mins;
            matched.push(block);
        } else {
            block.variance_mins = -block.duration_mins;
            missed.push(block);
        }
    }

    // Unplanned: group unlinked entries by category
    let mut category_map: HashMap<Option<String>, Vec<ActualEntry>> = HashMap::new();
    for entry in &unlinked_entries {
        category_map.entry(entry.category.clone()).or_default().push(entry.clone());
    }
    let mut unplanned: Vec<UnplannedGroup> = category_map
        .into_iter()
        .map(|(cat, entries)| {
            let total_mins = entries.iter().map(|e| e.active_mins).sum();
            UnplannedGroup {
                category: cat,
                entries,
                total_mins,
            }
        })
        .collect();
    unplanned.sort_by(|a, b| b.total_mins.cmp(&a.total_mins));

    // Type breakdown
    let planned_work_mins: i64 = planned_blocks
        .iter()
        .filter(|b| b.plan_type == "time_block" || b.plan_type == "review")
        .map(|b| b.duration_mins)
        .sum();
    let planned_commitment_mins: i64 = planned_blocks
        .iter()
        .filter(|b| b.plan_type == "meeting" || b.plan_type == "event")
        .map(|b| b.duration_mins)
        .sum();

    let planned_total: i64 = planned_blocks.iter().map(|b| b.duration_mins).sum();
    let actual_total: i64 = actual_entries.iter().map(|e| e.active_mins).sum();

    Ok(PlannedVsActualData {
        date: date.to_string(),
        matched,
        unplanned,
        missed,
        planned_total_mins: planned_total,
        actual_total_mins: actual_total,
        difference_mins: actual_total - planned_total,
        planned_work_mins,
        planned_commitment_mins,
        planned_blocks,
        actual_entries,
    })
}

/// Increments a date string (YYYY-MM-DD) by one day.
fn increment_date(date: &str) -> String {
    chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map(|d| d.succ_opt().unwrap_or(d))
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|_| date.to_string())
}
