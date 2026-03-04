use crate::models::reference::{CreateReference, Reference};
use crate::utils::errors::AppError;
use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

/// Regex for matching inline entity references: @task[id], @note[id], @plan[id].
static INLINE_REF_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"@(task|note|plan)\[([a-zA-Z0-9_-]+)\]").unwrap());

/// Regex for matching fenced code blocks (triple backtick).
static CODE_BLOCK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)```.*?```").unwrap());

/// Regex for matching inline code (single backtick).
static INLINE_CODE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"`[^`]+`").unwrap());

/// Parses inline references from markdown text.
///
/// Matches patterns: `@task[<id>]`, `@note[<id>]`, `@plan[<id>]`.
/// Ignores references inside fenced code blocks and inline code spans.
/// Deduplicates results.
pub fn parse_inline_references(body: &str) -> Vec<(String, String)> {
    // Remove code blocks and inline code so refs inside them are ignored
    let without_code_blocks = CODE_BLOCK_RE.replace_all(body, "");
    let clean = INLINE_CODE_RE.replace_all(&without_code_blocks, "");

    let mut seen = HashSet::new();
    let mut results = Vec::new();

    for cap in INLINE_REF_RE.captures_iter(&clean) {
        let entity_type = cap[1].to_string();
        let entity_id = cap[2].to_string();
        let key = (entity_type.clone(), entity_id.clone());
        if seen.insert(key) {
            results.push((entity_type, entity_id));
        }
    }

    results
}

/// Diffs existing references against newly parsed references.
///
/// Returns a tuple of `(to_create, to_delete_ids)` where:
/// - `to_create` contains `CreateReference` for new references not yet in the DB.
/// - `to_delete_ids` contains IDs of existing references no longer in the parsed set.
///
/// Only considers references with relation "references" (auto-managed inline refs).
/// Manual references (blocks, related_to, etc.) are preserved.
pub fn diff_references(
    existing: &[Reference],
    parsed: &[(String, String)],
    source_type: &str,
    source_id: &str,
) -> (Vec<CreateReference>, Vec<String>) {
    // Build set of (target_type, target_id) from parsed references
    let parsed_set: HashSet<(&str, &str)> = parsed
        .iter()
        .map(|(t, id)| (t.as_str(), id.as_str()))
        .collect();

    // Only consider auto-managed "references" relations for diffing
    let auto_refs: Vec<&Reference> = existing
        .iter()
        .filter(|r| r.relation == "references")
        .collect();

    // Build set of existing (target_type, target_id)
    let existing_set: HashSet<(&str, &str)> = auto_refs
        .iter()
        .filter_map(|r| {
            r.target_id
                .as_deref()
                .map(|tid| (r.target_type.as_str(), tid))
        })
        .collect();

    // References to create: in parsed but not in existing
    let to_create: Vec<CreateReference> = parsed
        .iter()
        .filter(|(t, id)| !existing_set.contains(&(t.as_str(), id.as_str())))
        .map(|(target_type, target_id)| CreateReference {
            source_type: source_type.to_string(),
            source_id: source_id.to_string(),
            target_type: target_type.clone(),
            target_id: Some(target_id.clone()),
            target_uri: None,
            relation: Some("references".to_string()),
        })
        .collect();

    // References to delete: in existing but not in parsed
    let to_delete: Vec<String> = auto_refs
        .iter()
        .filter(|r| {
            if let Some(ref tid) = r.target_id {
                !parsed_set.contains(&(r.target_type.as_str(), tid.as_str()))
            } else {
                false
            }
        })
        .map(|r| r.id.clone())
        .collect();

    (to_create, to_delete)
}

/// Checks whether setting `task_id`'s parent to `proposed_parent_id` would
/// create a circular reference in the subtask hierarchy.
///
/// Traverses the parent chain from `proposed_parent_id` upward. If `task_id`
/// is found as an ancestor, a cycle would be created.
///
/// Also enforces a maximum nesting depth of 10 levels.
pub fn would_create_cycle(
    conn: &rusqlite::Connection,
    task_id: &str,
    proposed_parent_id: &str,
) -> Result<bool, AppError> {
    // Direct self-reference
    if task_id == proposed_parent_id {
        return Ok(true);
    }

    let mut current_id = proposed_parent_id.to_string();
    let mut depth = 0;
    let max_depth = 10;

    loop {
        depth += 1;
        if depth > max_depth {
            return Err(AppError::Validation(
                "Maximum subtask nesting depth of 10 exceeded".to_string(),
            ));
        }

        let parent: Option<String> = conn
            .query_row(
                "SELECT parent_task_id FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                [&current_id],
                |row| row.get(0),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::NotFound {
                    entity: "Task".to_string(),
                    id: current_id.clone(),
                },
                other => AppError::Database(other),
            })?;

        match parent {
            Some(pid) => {
                if pid == task_id {
                    return Ok(true); // Cycle detected
                }
                current_id = pid;
            }
            None => return Ok(false), // Reached a root task, no cycle
        }
    }
}

/// Computes the current nesting depth of a task (how many ancestors it has).
/// Used to validate that adding a subtask would not exceed the max depth of 10.
pub fn get_task_depth(conn: &rusqlite::Connection, task_id: &str) -> Result<u32, AppError> {
    let mut current_id = task_id.to_string();
    let mut depth = 0u32;

    loop {
        let parent: Option<String> = conn
            .query_row(
                "SELECT parent_task_id FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                [&current_id],
                |row| row.get(0),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::NotFound {
                    entity: "Task".to_string(),
                    id: current_id.clone(),
                },
                other => AppError::Database(other),
            })?;

        match parent {
            Some(pid) => {
                depth += 1;
                if depth > 10 {
                    return Err(AppError::Validation(
                        "Maximum subtask nesting depth of 10 exceeded".to_string(),
                    ));
                }
                current_id = pid;
            }
            None => return Ok(depth),
        }
    }
}
