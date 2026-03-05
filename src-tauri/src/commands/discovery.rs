use crate::models::discovery::{
    ActualEntry, BacklinkWithContext, FacetedSearchResponse, FilterConfig, GraphData, GraphQuery,
    GroupEntry, GroupedViewResult, PlannedBlock, PlannedVsActualData,
};
use crate::services::faceted_search::execute_faceted_search;
use crate::services::graph::compute_graph;
use crate::state::AppState;
use crate::utils::errors::AppError;
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

/// Computes planned vs actual data for a single date.
fn compute_planned_vs_actual(
    conn: &rusqlite::Connection,
    workspace_id: &str,
    date: &str,
) -> Result<PlannedVsActualData, rusqlite::Error> {
    let date_start = format!("{}T00:00:00", date);
    let date_end = format!("{}T23:59:59", date);

    let mut plan_stmt = conn.prepare(
        "SELECT id, title, start_time, end_time, color
         FROM plans
         WHERE workspace_id = ?1
           AND start_time >= ?2 AND start_time <= ?3
           AND deleted_at IS NULL
           AND type IN ('time_block', 'event', 'meeting', 'review')
         ORDER BY start_time ASC",
    )?;

    let planned_blocks: Vec<PlannedBlock> = plan_stmt
        .query_map(
            rusqlite::params![workspace_id, date_start, date_end],
            |row| {
                let start: String = row.get(2)?;
                let end: String = row.get(3)?;
                let duration_mins = compute_duration_mins(&start, &end);

                Ok(PlannedBlock {
                    plan_id: row.get(0)?,
                    title: row.get(1)?,
                    start_time: start,
                    end_time: end,
                    duration_mins,
                    color: row.get(4)?,
                })
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;

    let mut entry_stmt = conn.prepare(
        "SELECT id, start_time, end_time, active_mins, category,
                linked_plan_id, linked_task_id, notes
         FROM time_entries
         WHERE workspace_id = ?1
           AND start_time >= ?2 AND start_time <= ?3
           AND deleted_at IS NULL
         ORDER BY start_time ASC",
    )?;

    let actual_entries: Vec<ActualEntry> = entry_stmt
        .query_map(
            rusqlite::params![workspace_id, date_start, date_end],
            |row| {
                let notes: Option<String> = row.get(7)?;
                let preview = notes.map(|n| {
                    if n.len() > 100 {
                        format!("{}...", &n[..100])
                    } else {
                        n
                    }
                });

                Ok(ActualEntry {
                    time_entry_id: row.get(0)?,
                    start_time: row.get(1)?,
                    end_time: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    active_mins: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                    category: row.get(4)?,
                    linked_plan_id: row.get(5)?,
                    linked_task_id: row.get(6)?,
                    notes_preview: preview,
                })
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;

    let planned_total: i64 = planned_blocks.iter().map(|b| b.duration_mins).sum();
    let actual_total: i64 = actual_entries.iter().map(|e| e.active_mins).sum();

    Ok(PlannedVsActualData {
        date: date.to_string(),
        planned_blocks,
        actual_entries,
        planned_total_mins: planned_total,
        actual_total_mins: actual_total,
        difference_mins: actual_total - planned_total,
    })
}

/// Computes duration in minutes between two ISO 8601 timestamps.
fn compute_duration_mins(start: &str, end: &str) -> i64 {
    let start_mins = extract_minutes_of_day(start);
    let end_mins = extract_minutes_of_day(end);
    if end_mins > start_mins {
        end_mins - start_mins
    } else {
        0
    }
}

/// Extracts minutes since midnight from an ISO 8601 timestamp.
fn extract_minutes_of_day(timestamp: &str) -> i64 {
    if let Some(time_part) = timestamp.split('T').nth(1) {
        let parts: Vec<&str> = time_part.split(':').collect();
        if parts.len() >= 2 {
            let hours: i64 = parts[0].parse().unwrap_or(0);
            let mins: i64 = parts[1].parse().unwrap_or(0);
            return hours * 60 + mins;
        }
    }
    0
}

/// Increments a date string (YYYY-MM-DD) by one day.
fn increment_date(date: &str) -> String {
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() != 3 {
        return date.to_string();
    }

    let year: i32 = parts[0].parse().unwrap_or(2025);
    let month: u32 = parts[1].parse().unwrap_or(1);
    let day: u32 = parts[2].parse().unwrap_or(1);

    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    };

    if day < days_in_month {
        format!("{:04}-{:02}-{:02}", year, month, day + 1)
    } else if month < 12 {
        format!("{:04}-{:02}-01", year, month + 1)
    } else {
        format!("{:04}-01-01", year + 1)
    }
}
