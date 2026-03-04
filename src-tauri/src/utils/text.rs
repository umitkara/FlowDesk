use regex::Regex;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::LazyLock;

static ENTITY_REF_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"@(task|note|plan)\[([0-9a-f\-]{36})\]").unwrap());

/// Replaces `@task[uuid]`, `@note[uuid]`, `@plan[uuid]` patterns in text
/// with the entity's title looked up from the database.
/// Unknown or deleted entities are replaced with a short label like `[Task]`.
pub fn resolve_entity_refs(text: &str, conn: &Connection) -> String {
    // Collect unique IDs per type to batch-fetch
    let mut task_ids: Vec<String> = Vec::new();
    let mut note_ids: Vec<String> = Vec::new();

    for cap in ENTITY_REF_RE.captures_iter(text) {
        let entity_type = &cap[1];
        let entity_id = cap[2].to_string();
        match entity_type {
            "task" => {
                if !task_ids.contains(&entity_id) {
                    task_ids.push(entity_id);
                }
            }
            "note" | "plan" => {
                if !note_ids.contains(&entity_id) {
                    note_ids.push(entity_id);
                }
            }
            _ => {}
        }
    }

    // Batch-fetch titles
    let mut titles: HashMap<String, String> = HashMap::new();

    for id in &task_ids {
        if let Ok(title) = conn.query_row(
            "SELECT title FROM tasks WHERE id = ?1",
            [id],
            |row| row.get::<_, String>(0),
        ) {
            titles.insert(id.clone(), title);
        }
    }

    for id in &note_ids {
        if let Ok(title) = conn.query_row(
            "SELECT title FROM notes WHERE id = ?1",
            [id],
            |row| row.get::<_, Option<String>>(0),
        ) {
            titles.insert(id.clone(), title.unwrap_or_else(|| "Untitled".into()));
        }
    }

    // Replace patterns
    ENTITY_REF_RE
        .replace_all(text, |caps: &regex::Captures| {
            let entity_type = &caps[1];
            let entity_id = &caps[2];
            if let Some(title) = titles.get(entity_id) {
                title.clone()
            } else {
                // Fallback: show a short label
                match entity_type {
                    "task" => "[Task]".to_string(),
                    "note" => "[Note]".to_string(),
                    "plan" => "[Plan]".to_string(),
                    _ => "[Ref]".to_string(),
                }
            }
        })
        .into_owned()
}
