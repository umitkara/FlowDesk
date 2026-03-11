use crate::models::reference::{CreateReference, Reference};
use crate::utils::errors::AppError;
use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

/// Regex for matching inline entity references: @task[id], @note[id], @plan[id], @time_entry[id].
static INLINE_REF_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"@(task|note|plan|time_entry)\[([a-zA-Z0-9_-]+)\]").unwrap());

/// Regex for matching fenced code blocks (triple backtick).
static CODE_BLOCK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)```.*?```").unwrap());

/// Regex for matching inline code (single backtick).
static INLINE_CODE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"`[^`]+`").unwrap());

/// Parses inline references from markdown text.
///
/// Matches patterns: `@task[<id>]`, `@note[<id>]`, `@plan[<id>]`, `@time_entry[<id>]`.
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

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_inline_references ---
    #[test]
    fn parses_task_ref() {
        let refs = parse_inline_references("See @task[abc123] for details.");
        assert_eq!(refs, vec![("task".to_string(), "abc123".to_string())]);
    }

    #[test]
    fn parses_note_and_plan_refs() {
        let refs = parse_inline_references("Link @note[n1] and @plan[p2].");
        assert_eq!(refs.len(), 2);
        assert_eq!(refs[0], ("note".to_string(), "n1".to_string()));
        assert_eq!(refs[1], ("plan".to_string(), "p2".to_string()));
    }

    #[test]
    fn parses_time_entry_ref() {
        let refs = parse_inline_references("Tracked @time_entry[te123] session.");
        assert_eq!(refs, vec![("time_entry".to_string(), "te123".to_string())]);
    }

    #[test]
    fn deduplicates_refs() {
        let refs = parse_inline_references("@task[a] then @task[a] again.");
        assert_eq!(refs.len(), 1);
    }

    #[test]
    fn ignores_refs_in_code_blocks() {
        let body = "before\n```\n@task[hidden]\n```\nafter @task[visible]";
        let refs = parse_inline_references(body);
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].1, "visible");
    }

    #[test]
    fn ignores_refs_in_inline_code() {
        let refs = parse_inline_references("see `@task[hidden]` vs @task[visible]");
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].1, "visible");
    }

    #[test]
    fn empty_body_returns_empty() {
        assert!(parse_inline_references("").is_empty());
    }

    // --- diff_references ---
    #[test]
    fn diff_creates_new_refs() {
        let existing = vec![];
        let parsed = vec![("task".to_string(), "t1".to_string())];
        let (to_create, to_delete) = diff_references(&existing, &parsed, "note", "n1");
        assert_eq!(to_create.len(), 1);
        assert!(to_delete.is_empty());
        assert_eq!(to_create[0].target_type, "task");
    }

    #[test]
    fn diff_deletes_removed_refs() {
        let existing = vec![Reference {
            id: "ref1".to_string(),
            source_type: "note".to_string(),
            source_id: "n1".to_string(),
            target_type: "task".to_string(),
            target_id: Some("t1".to_string()),
            target_uri: None,
            relation: "references".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }];
        let parsed = vec![];
        let (to_create, to_delete) = diff_references(&existing, &parsed, "note", "n1");
        assert!(to_create.is_empty());
        assert_eq!(to_delete, vec!["ref1"]);
    }

    #[test]
    fn diff_preserves_manual_refs() {
        let existing = vec![Reference {
            id: "ref1".to_string(),
            source_type: "note".to_string(),
            source_id: "n1".to_string(),
            target_type: "task".to_string(),
            target_id: Some("t1".to_string()),
            target_uri: None,
            relation: "blocks".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }];
        let parsed = vec![];
        let (to_create, to_delete) = diff_references(&existing, &parsed, "note", "n1");
        assert!(to_create.is_empty());
        assert!(to_delete.is_empty()); // manual "blocks" ref preserved
    }

    #[test]
    fn diff_no_change_when_matching() {
        let existing = vec![Reference {
            id: "ref1".to_string(),
            source_type: "note".to_string(),
            source_id: "n1".to_string(),
            target_type: "task".to_string(),
            target_id: Some("t1".to_string()),
            target_uri: None,
            relation: "references".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }];
        let parsed = vec![("task".to_string(), "t1".to_string())];
        let (to_create, to_delete) = diff_references(&existing, &parsed, "note", "n1");
        assert!(to_create.is_empty());
        assert!(to_delete.is_empty());
    }

    // --- DB integration tests (cycle detection) ---
    #[test]
    fn self_reference_is_cycle() {
        let conn = crate::test_helpers::test_db();
        let t1 = crate::test_helpers::insert_test_task(&conn, "Task 1", "todo", None);
        assert!(would_create_cycle(&conn, &t1, &t1).unwrap());
    }

    #[test]
    fn simple_chain_no_cycle() {
        let conn = crate::test_helpers::test_db();
        let t1 = crate::test_helpers::insert_test_task(&conn, "A", "todo", None);
        let t2 = crate::test_helpers::insert_test_task(&conn, "B", "todo", Some(&t1));
        // Setting t2's parent to t1 should not be a cycle (it already is)
        assert!(!would_create_cycle(&conn, &t2, &t1).unwrap());
    }

    #[test]
    fn detects_cycle_in_chain() {
        let conn = crate::test_helpers::test_db();
        let t1 = crate::test_helpers::insert_test_task(&conn, "A", "todo", None);
        let t2 = crate::test_helpers::insert_test_task(&conn, "B", "todo", Some(&t1));
        let t3 = crate::test_helpers::insert_test_task(&conn, "C", "todo", Some(&t2));
        // Setting t1's parent to t3 would create: t1 -> t3 -> t2 -> t1 (cycle)
        assert!(would_create_cycle(&conn, &t1, &t3).unwrap());
    }

    #[test]
    fn get_depth_root_is_zero() {
        let conn = crate::test_helpers::test_db();
        let t1 = crate::test_helpers::insert_test_task(&conn, "Root", "todo", None);
        assert_eq!(get_task_depth(&conn, &t1).unwrap(), 0);
    }

    #[test]
    fn get_depth_nested() {
        let conn = crate::test_helpers::test_db();
        let t1 = crate::test_helpers::insert_test_task(&conn, "A", "todo", None);
        let t2 = crate::test_helpers::insert_test_task(&conn, "B", "todo", Some(&t1));
        let t3 = crate::test_helpers::insert_test_task(&conn, "C", "todo", Some(&t2));
        assert_eq!(get_task_depth(&conn, &t3).unwrap(), 2);
    }
}
