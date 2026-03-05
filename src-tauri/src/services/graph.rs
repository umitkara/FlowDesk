use crate::models::discovery::{GraphData, GraphEdge, GraphNode, GraphQuery};
use rusqlite::Connection;
use std::collections::{HashMap, HashSet, VecDeque};

/// Computes graph data from the references table.
///
/// Supports two modes:
/// - **Centered**: BFS from a specific entity up to a given depth
/// - **Full**: All references in the workspace (capped at max_nodes)
pub fn compute_graph(conn: &Connection, query: &GraphQuery) -> Result<GraphData, rusqlite::Error> {
    let max_nodes = query.max_nodes.unwrap_or(500) as usize;

    if let Some(ref center_id) = query.center_entity_id {
        compute_centered_graph(conn, query, center_id, max_nodes)
    } else {
        compute_full_graph(conn, query, max_nodes)
    }
}

/// BFS from center entity, collecting nodes up to `depth` hops.
fn compute_centered_graph(
    conn: &Connection,
    query: &GraphQuery,
    center_id: &str,
    max_nodes: usize,
) -> Result<GraphData, rusqlite::Error> {
    let depth = query.depth.unwrap_or(2);
    let include_tasks = query.entity_types.is_none()
        || query
            .entity_types
            .as_ref()
            .is_some_and(|t| t.iter().any(|x| x == "task"));
    let mut visited: HashSet<String> = HashSet::new();
    let mut queue: VecDeque<(String, i32)> = VecDeque::new();
    let mut edges: Vec<GraphEdge> = Vec::new();
    let mut edge_ids: HashSet<String> = HashSet::new();

    queue.push_back((center_id.to_string(), 0));
    visited.insert(center_id.to_string());

    while let Some((entity_id, current_depth)) = queue.pop_front() {
        if visited.len() >= max_nodes {
            break;
        }

        // Find references where this entity is source or target
        let mut stmt = conn.prepare(
            "SELECT id, source_type, source_id, target_type, target_id, relation
             FROM refs
             WHERE (source_id = ?1 OR target_id = ?1)
               AND source_id IS NOT NULL AND target_id IS NOT NULL",
        )?;

        let refs: Vec<(String, String, String, String, String, String)> = stmt
            .query_map([&entity_id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        for (ref_id, _source_type, source_id, _target_type, target_id, relation) in refs {
            if !edge_ids.contains(&ref_id) {
                edge_ids.insert(ref_id.clone());
                edges.push(GraphEdge {
                    id: ref_id,
                    source: source_id.clone(),
                    target: target_id.clone(),
                    relation,
                });
            }

            if current_depth < depth {
                let other_id = if source_id == entity_id {
                    &target_id
                } else {
                    &source_id
                };
                if !visited.contains(other_id) {
                    visited.insert(other_id.clone());
                    queue.push_back((other_id.clone(), current_depth + 1));
                }
            }
        }

        // Include sub-task parent/child relationships
        if include_tasks {
            let subtask_edges =
                get_subtask_edges(conn, &entity_id, &query.workspace_id)?;
            for (edge_key, parent_id, child_id) in subtask_edges {
                if !edge_ids.contains(&edge_key) {
                    edge_ids.insert(edge_key.clone());
                    edges.push(GraphEdge {
                        id: edge_key,
                        source: parent_id.clone(),
                        target: child_id.clone(),
                        relation: "subtask".to_string(),
                    });
                }

                if current_depth < depth {
                    let other_id = if parent_id == entity_id {
                        &child_id
                    } else {
                        &parent_id
                    };
                    if !visited.contains(other_id) {
                        visited.insert(other_id.clone());
                        queue.push_back((other_id.clone(), current_depth + 1));
                    }
                }
            }
        }
    }

    // Load node metadata for all visited entities
    let nodes = load_nodes(conn, &visited, query)?;

    Ok(GraphData { nodes, edges })
}

/// Loads all references in the workspace and builds the full graph.
fn compute_full_graph(
    conn: &Connection,
    query: &GraphQuery,
    max_nodes: usize,
) -> Result<GraphData, rusqlite::Error> {
    let include_tasks = query.entity_types.is_none()
        || query
            .entity_types
            .as_ref()
            .is_some_and(|t| t.iter().any(|x| x == "task"));

    let mut sql = String::from(
        "SELECT r.id, r.source_type, r.source_id, r.target_type, r.target_id, r.relation
         FROM refs r
         WHERE r.source_id IS NOT NULL AND r.target_id IS NOT NULL",
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    // We need to filter by workspace — join with source entity tables
    // For simplicity, we collect all refs and then filter nodes by workspace
    if let Some(ref date_from) = query.date_from {
        sql.push_str(&format!(
            " AND r.created_at >= ?{}",
            params.len() + 1
        ));
        params.push(Box::new(date_from.clone()));
    }
    if let Some(ref date_to) = query.date_to {
        sql.push_str(&format!(
            " AND r.created_at <= ?{}",
            params.len() + 1
        ));
        params.push(Box::new(date_to.clone()));
    }

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut edges: Vec<GraphEdge> = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(GraphEdge {
                id: row.get(0)?,
                source: row.get(2)?,
                target: row.get(4)?,
                relation: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // Add sub-task parent/child relationships as edges
    if include_tasks {
        let subtask_edges = get_all_subtask_edges(conn, &query.workspace_id)?;
        let existing_ids: HashSet<String> = edges.iter().map(|e| e.id.clone()).collect();
        for edge in subtask_edges {
            if !existing_ids.contains(&edge.id) {
                edges.push(edge);
            }
        }
    }

    // Collect all unique entity IDs
    let mut entity_ids: HashSet<String> = HashSet::new();
    // Count connections per entity for prioritization
    let mut connection_counts: HashMap<String, usize> = HashMap::new();
    for edge in &edges {
        entity_ids.insert(edge.source.clone());
        entity_ids.insert(edge.target.clone());
        *connection_counts.entry(edge.source.clone()).or_insert(0) += 1;
        *connection_counts.entry(edge.target.clone()).or_insert(0) += 1;
    }

    // If too many nodes, keep the most connected ones
    if entity_ids.len() > max_nodes {
        let mut sorted: Vec<(String, usize)> = connection_counts.into_iter().collect();
        sorted.sort_by(|a, b| b.1.cmp(&a.1));
        entity_ids = sorted.into_iter().take(max_nodes).map(|(id, _)| id).collect();
    }

    let nodes = load_nodes(conn, &entity_ids, query)?;

    // Filter edges to only include those between kept nodes
    let node_ids: HashSet<&str> = nodes.iter().map(|n| n.id.as_str()).collect();
    let filtered_edges: Vec<GraphEdge> = edges
        .into_iter()
        .filter(|e| node_ids.contains(e.source.as_str()) && node_ids.contains(e.target.as_str()))
        .collect();

    Ok(GraphData {
        nodes,
        edges: filtered_edges,
    })
}

/// Returns subtask edges for a specific entity (as parent or child).
/// Returns tuples of (edge_key, parent_id, child_id).
fn get_subtask_edges(
    conn: &Connection,
    entity_id: &str,
    workspace_id: &str,
) -> Result<Vec<(String, String, String)>, rusqlite::Error> {
    let mut results = Vec::new();

    // Entity is a parent task — find its children
    let mut stmt = conn.prepare(
        "SELECT id, parent_task_id FROM tasks
         WHERE parent_task_id = ?1 AND workspace_id = ?2 AND deleted_at IS NULL",
    )?;
    let children: Vec<(String, String)> = stmt
        .query_map(rusqlite::params![entity_id, workspace_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (child_id, parent_id) in children {
        let edge_key = format!("subtask_{}_{}", parent_id, child_id);
        results.push((edge_key, parent_id, child_id));
    }

    // Entity is a child task — find its parent
    let parent: Option<String> = conn
        .query_row(
            "SELECT parent_task_id FROM tasks
             WHERE id = ?1 AND parent_task_id IS NOT NULL AND workspace_id = ?2 AND deleted_at IS NULL",
            rusqlite::params![entity_id, workspace_id],
            |row| row.get(0),
        )
        .ok();
    if let Some(parent_id) = parent {
        let edge_key = format!("subtask_{}_{}", parent_id, entity_id);
        results.push((edge_key, parent_id, entity_id.to_string()));
    }

    Ok(results)
}

/// Returns all subtask edges in a workspace for the full graph mode.
fn get_all_subtask_edges(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Vec<GraphEdge>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, parent_task_id FROM tasks
         WHERE parent_task_id IS NOT NULL AND workspace_id = ?1 AND deleted_at IS NULL",
    )?;
    let edges: Vec<GraphEdge> = stmt
        .query_map([workspace_id], |row| {
            let child_id: String = row.get(0)?;
            let parent_id: String = row.get(1)?;
            Ok(GraphEdge {
                id: format!("subtask_{}_{}", parent_id, child_id),
                source: parent_id,
                target: child_id,
                relation: "subtask".to_string(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(edges)
}

/// Loads node metadata for a set of entity IDs by querying each entity table.
fn load_nodes(
    conn: &Connection,
    entity_ids: &HashSet<String>,
    query: &GraphQuery,
) -> Result<Vec<GraphNode>, rusqlite::Error> {
    let mut nodes: Vec<GraphNode> = Vec::new();
    let type_filter = query.entity_types.as_deref();

    for entity_id in entity_ids {
        // Try notes
        if type_filter.is_none()
            || type_filter.is_some_and(|t| t.iter().any(|x| x == "note"))
        {
            if let Ok(node) = conn.query_row(
                "SELECT id, title, color, importance, workspace_id FROM notes WHERE id = ?1 AND deleted_at IS NULL",
                [entity_id],
                |row| {
                    Ok(GraphNode {
                        id: row.get(0)?,
                        entity_type: "note".to_string(),
                        title: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "Untitled".to_string()),
                        color: row.get(2)?,
                        importance: row.get(3)?,
                        workspace_id: row.get(4)?,
                    })
                },
            ) {
                if node.workspace_id == query.workspace_id {
                    nodes.push(node);
                    continue;
                }
            }
        }

        // Try tasks
        if type_filter.is_none()
            || type_filter.is_some_and(|t| t.iter().any(|x| x == "task"))
        {
            if let Ok(node) = conn.query_row(
                "SELECT id, title, color, workspace_id FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                [entity_id],
                |row| {
                    Ok(GraphNode {
                        id: row.get(0)?,
                        entity_type: "task".to_string(),
                        title: row.get(1)?,
                        color: row.get(2)?,
                        importance: None,
                        workspace_id: row.get(3)?,
                    })
                },
            ) {
                if node.workspace_id == query.workspace_id {
                    nodes.push(node);
                    continue;
                }
            }
        }

        // Try plans
        if type_filter.is_none()
            || type_filter.is_some_and(|t| t.iter().any(|x| x == "plan"))
        {
            if let Ok(node) = conn.query_row(
                "SELECT id, title, color, importance, workspace_id FROM plans WHERE id = ?1 AND deleted_at IS NULL",
                [entity_id],
                |row| {
                    Ok(GraphNode {
                        id: row.get(0)?,
                        entity_type: "plan".to_string(),
                        title: row.get(1)?,
                        color: row.get(2)?,
                        importance: row.get(3)?,
                        workspace_id: row.get(4)?,
                    })
                },
            ) {
                if node.workspace_id == query.workspace_id {
                    nodes.push(node);
                    continue;
                }
            }
        }

        // Try time entries
        if type_filter.is_none()
            || type_filter.is_some_and(|t| t.iter().any(|x| x == "time_entry"))
        {
            if let Ok(node) = conn.query_row(
                "SELECT id, notes, workspace_id FROM time_entries WHERE id = ?1 AND deleted_at IS NULL",
                [entity_id],
                |row| {
                    let notes: String = row.get::<_, Option<String>>(1)?.unwrap_or_default();
                    let title = if notes.len() > 50 {
                        format!("{}...", &notes[..50])
                    } else if notes.is_empty() {
                        "Time Entry".to_string()
                    } else {
                        notes
                    };
                    Ok(GraphNode {
                        id: row.get(0)?,
                        entity_type: "time_entry".to_string(),
                        title,
                        color: None,
                        importance: None,
                        workspace_id: row.get(2)?,
                    })
                },
            ) {
                if node.workspace_id == query.workspace_id {
                    nodes.push(node);
                }
            }
        }
    }

    Ok(nodes)
}
