use crate::models::note::{
    CreateNoteInput, FolderNode, Note, NoteListItem, NoteQuery, UpdateNoteInput,
};
use crate::models::undo::{OperationType, UndoEntityType, UndoableOperation};
use crate::services::activity::log_activity;
use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::text::resolve_entity_refs;
use crate::utils::{id::generate_id, time::now_iso};
use sha2::{Digest, Sha256};
use tauri::State;

/// Computes the SHA-256 hex digest of the given text.
fn compute_body_hash(body: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(body.as_bytes());
    hex::encode(hasher.finalize())
}

/// Counts the number of whitespace-separated words in a string (HTML tags stripped).
fn word_count(text: &str) -> i32 {
    let plain = strip_html_tags(text);
    plain.split_whitespace().count() as i32
}

/// Strips HTML tags and common HTML entities from a string, returning plain text.
fn strip_html_tags(html: &str) -> String {
    // Remove tags
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                result.push(' ');
            }
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    // Replace common HTML entities
    result
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
}

/// Returns a plain-text preview of the body (first ~200 characters, HTML tags stripped).
fn body_preview(body: &str) -> String {
    strip_html_tags(body).chars().take(200).collect()
}

/// Ensures tags exist in the workspace and links them to a note.
///
/// For each tag name, creates the tag in the `tags` table if it doesn't
/// already exist, then inserts the note-tag association.
fn sync_tags(
    conn: &rusqlite::Connection,
    note_id: &str,
    workspace_id: &str,
    tags: &[String],
) -> Result<(), AppError> {
    // Remove all existing tag associations for this note
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", [note_id])?;

    for tag_name in tags {
        // Upsert tag
        let tag_id: String = match conn.query_row(
            "SELECT id FROM tags WHERE workspace_id = ?1 AND name = ?2",
            rusqlite::params![workspace_id, tag_name],
            |row| row.get(0),
        ) {
            Ok(id) => id,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                let new_id = generate_id();
                conn.execute(
                    "INSERT INTO tags (id, workspace_id, name, created_at) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![new_id, workspace_id, tag_name, now_iso()],
                )?;
                new_id
            }
            Err(e) => return Err(AppError::Database(e)),
        };

        // Link tag to note
        conn.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![note_id, tag_id],
        )?;
    }

    Ok(())
}

/// Fetches tag names associated with a note.
fn get_note_tags(conn: &rusqlite::Connection, note_id: &str) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT t.name FROM tags t
         INNER JOIN note_tags nt ON nt.tag_id = t.id
         WHERE nt.note_id = ?1
         ORDER BY t.name",
    )?;
    let tags = stmt
        .query_map([note_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(tags)
}

/// Reads a single note row from the database into a `Note` struct.
pub fn read_note(conn: &rusqlite::Connection, id: &str) -> Result<Note, AppError> {
    let note = conn.query_row(
        "SELECT id, workspace_id, title, date, body, folder, category, type,
                color, importance, front_matter, body_hash, created_at, updated_at, deleted_at
         FROM notes WHERE id = ?1",
        [id],
        |row| {
            let fm_str: Option<String> = row.get(10)?;
            let front_matter = fm_str
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok());

            Ok(Note {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                title: row.get(2)?,
                date: row.get(3)?,
                body: row.get(4)?,
                folder: row.get(5)?,
                category: row.get(6)?,
                note_type: row.get(7)?,
                color: row.get(8)?,
                importance: row.get(9)?,
                front_matter,
                body_hash: row.get(11)?,
                tags: Vec::new(), // populated below
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
                deleted_at: row.get(14)?,
            })
        },
    );

    match note {
        Ok(mut n) => {
            n.tags = get_note_tags(conn, &n.id)?;
            Ok(n)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(AppError::NotFound {
            entity: "Note".to_string(),
            id: id.to_string(),
        }),
        Err(e) => Err(AppError::Database(e)),
    }
}

/// Creates a new note in the database.
#[tauri::command]
pub fn create_note(
    state: State<'_, AppState>,
    input: CreateNoteInput,
) -> Result<Note, AppError> {
    let id = generate_id();
    let now = now_iso();
    let body = input.body.unwrap_or_default();
    let body_hash = compute_body_hash(&body);

    let fm_json = input
        .front_matter
        .as_ref()
        .map(|v| serde_json::to_string(v).unwrap_or_default());

    state.db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO notes (id, workspace_id, title, date, body, folder, category, type,
                                color, importance, front_matter, body_hash, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![
                id,
                input.workspace_id,
                input.title,
                input.date,
                body,
                input.folder,
                input.category,
                input.note_type,
                input.color,
                input.importance,
                fm_json,
                body_hash,
                now,
                now,
            ],
        )?;
        Ok(())
    })?;

    if let Some(ref tags) = input.tags {
        state
            .db
            .with_conn(|conn| sync_tags(conn, &id, &input.workspace_id, tags).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            }))?;
    }

    let note = state.db.with_conn(|conn| {
        read_note(conn, &id).map_err(|e| match e {
            AppError::Database(db_err) => db_err,
            _ => rusqlite::Error::InvalidQuery,
        })
    })
    .map_err(AppError::Database)?;

    // Best-effort activity logging
    let _ = state.db.with_conn(|conn| {
        log_activity(conn, &input.workspace_id, "note", &id, note.title.as_deref(), "created", None)
    });

    Ok(note)
}

/// Retrieves a single note by ID (excludes soft-deleted).
#[tauri::command]
pub fn get_note(state: State<'_, AppState>, id: String) -> Result<Note, AppError> {
    state.db.with_conn(|conn| {
        let note = read_note(conn, &id).map_err(|e| match e {
            AppError::Database(db_err) => db_err,
            other => {
                // Convert non-database errors through string representation
                rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                    other.to_string(),
                )))
            }
        })?;

        if note.deleted_at.is_some() {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        Ok(note)
    })
    .map_err(|e| {
        if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
            AppError::NotFound {
                entity: "Note".to_string(),
                id,
            }
        } else {
            AppError::Database(e)
        }
    })
}

/// Updates fields on an existing note (partial update — only provided fields are changed).
#[tauri::command]
pub fn update_note(
    state: State<'_, AppState>,
    id: String,
    input: UpdateNoteInput,
) -> Result<Note, AppError> {
    let now = now_iso();

    // Capture previous state for undo
    if let Ok(prev_note) = state.db.with_conn(|conn| {
        read_note(conn, &id).map_err(|e| match e {
            AppError::Database(db_err) => db_err,
            _ => rusqlite::Error::InvalidQuery,
        })
    }) {
        let prev_state = serde_json::json!({
            "title": prev_note.title,
            "body": prev_note.body,
            "body_hash": prev_note.body_hash,
        });
        if let Ok(mut history) = state.operation_history.lock() {
            history.push(UndoableOperation {
                operation_type: OperationType::Update,
                entity_type: UndoEntityType::Note,
                entity_id: id.clone(),
                previous_state: prev_state,
                description: format!("Edit note: {}", prev_note.title.as_deref().unwrap_or("Untitled")),
                timestamp: now.clone(),
            });
        }
    }

    state.db.with_conn(|conn| {
        // Verify note exists and is not deleted
        let deleted: Option<String> = conn.query_row(
            "SELECT deleted_at FROM notes WHERE id = ?1",
            [&id],
            |row| row.get(0),
        )?;

        if deleted.is_some() {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        // Build a single UPDATE statement with all provided fields
        let mut set_clauses = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        let mut idx = 1u32;

        if let Some(ref title) = input.title {
            set_clauses.push(format!("title = ?{}", idx));
            params.push(Box::new(title.clone()));
            idx += 1;
        }
        if let Some(ref date) = input.date {
            set_clauses.push(format!("date = ?{}", idx));
            params.push(Box::new(date.clone()));
            idx += 1;
        }
        if let Some(ref body) = input.body {
            let hash = compute_body_hash(body);
            set_clauses.push(format!("body = ?{}", idx));
            params.push(Box::new(body.clone()));
            idx += 1;
            set_clauses.push(format!("body_hash = ?{}", idx));
            params.push(Box::new(hash));
            idx += 1;
        }
        if let Some(ref folder) = input.folder {
            set_clauses.push(format!("folder = ?{}", idx));
            params.push(Box::new(folder.clone()));
            idx += 1;
        }
        if let Some(ref category) = input.category {
            set_clauses.push(format!("category = ?{}", idx));
            params.push(Box::new(category.clone()));
            idx += 1;
        }
        if let Some(ref note_type) = input.note_type {
            set_clauses.push(format!("type = ?{}", idx));
            params.push(Box::new(note_type.clone()));
            idx += 1;
        }
        if let Some(ref color) = input.color {
            set_clauses.push(format!("color = ?{}", idx));
            params.push(Box::new(color.clone()));
            idx += 1;
        }
        if let Some(ref importance) = input.importance {
            set_clauses.push(format!("importance = ?{}", idx));
            params.push(Box::new(importance.clone()));
            idx += 1;
        }
        if let Some(ref fm) = input.front_matter {
            let fm_str = serde_json::to_string(fm).unwrap_or_default();
            set_clauses.push(format!("front_matter = ?{}", idx));
            params.push(Box::new(fm_str));
            idx += 1;
        }

        // Always update the timestamp
        set_clauses.push(format!("updated_at = ?{}", idx));
        params.push(Box::new(now.clone()));
        idx += 1;

        let sql = format!(
            "UPDATE notes SET {} WHERE id = ?{}",
            set_clauses.join(", "),
            idx
        );
        params.push(Box::new(id.clone()));

        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())?;

        // Sync tags if provided
        if let Some(ref tags) = input.tags {
            let workspace_id: String = conn.query_row(
                "SELECT workspace_id FROM notes WHERE id = ?1",
                [&id],
                |row| row.get(0),
            )?;
            sync_tags(conn, &id, &workspace_id, tags).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })?;
        }

        Ok(())
    })?;

    let note = state.db.with_conn(|conn| {
        read_note(conn, &id).map_err(|e| match e {
            AppError::Database(db_err) => db_err,
            _ => rusqlite::Error::InvalidQuery,
        })
    })
    .map_err(AppError::Database)?;

    // Best-effort activity logging
    let _ = state.db.with_conn(|conn| {
        log_activity(conn, &note.workspace_id, "note", &id, note.title.as_deref(), "updated", None)
    });

    Ok(note)
}

/// Soft-deletes a note by setting its `deleted_at` timestamp.
#[tauri::command]
pub fn delete_note(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    // Capture metadata before deletion for activity logging
    let meta: Option<(String, Option<String>)> = state.db.with_conn(|conn| {
        conn.query_row(
            "SELECT workspace_id, title FROM notes WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).ok().map_or(Ok(None), |v| Ok(Some(v)))
    })?;

    // Push undo operation
    if let Some((ref _ws, ref title)) = meta {
        if let Ok(mut history) = state.operation_history.lock() {
            history.push(UndoableOperation {
                operation_type: OperationType::Delete,
                entity_type: UndoEntityType::Note,
                entity_id: id.clone(),
                previous_state: serde_json::json!({}),
                description: format!("Delete note: {}", title.as_deref().unwrap_or("Untitled")),
                timestamp: now_iso(),
            });
        }
    }

    let now = now_iso();
    let affected = state.db.with_conn(|conn| {
        conn.execute(
            "UPDATE notes SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            rusqlite::params![now, id],
        )
    })?;

    if affected == 0 {
        return Err(AppError::NotFound {
            entity: "Note".to_string(),
            id,
        });
    }

    // Best-effort activity logging
    if let Some((workspace_id, title)) = meta {
        let _ = state.db.with_conn(|conn| {
            log_activity(conn, &workspace_id, "note", &id, title.as_deref(), "deleted", None)
        });
    }

    Ok(())
}

/// Restores a soft-deleted note by clearing its `deleted_at` timestamp.
#[tauri::command]
pub fn restore_note(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let now = now_iso();
    let affected = state.db.with_conn(|conn| {
        conn.execute(
            "UPDATE notes SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NOT NULL",
            rusqlite::params![now, id],
        )
    })?;

    if affected == 0 {
        return Err(AppError::NotFound {
            entity: "Note".to_string(),
            id,
        });
    }

    // Best-effort activity logging
    let _ = state.db.with_conn(|conn| {
        let meta: Option<(String, Option<String>)> = conn.query_row(
            "SELECT workspace_id, title FROM notes WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).ok();
        if let Some((wid, title)) = meta {
            log_activity(conn, &wid, "note", &id, title.as_deref(), "restored", None)?;
        }
        Ok(())
    });

    Ok(())
}

/// Permanently deletes a note and its tag associations from the database.
#[tauri::command]
pub fn hard_delete_note(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    // Capture metadata before hard deletion for activity logging
    let meta: Option<(String, Option<String>)> = state.db.with_conn(|conn| {
        conn.query_row(
            "SELECT workspace_id, title FROM notes WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).ok().map_or(Ok(None), |v| Ok(Some(v)))
    })?;

    let affected = state.db.with_conn(|conn| {
        conn.execute("DELETE FROM note_tags WHERE note_id = ?1", [&id])?;
        conn.execute("DELETE FROM notes WHERE id = ?1", [&id])
    })?;

    if affected == 0 {
        return Err(AppError::NotFound {
            entity: "Note".to_string(),
            id,
        });
    }

    // Best-effort activity logging
    if let Some((workspace_id, title)) = meta {
        let _ = state.db.with_conn(|conn| {
            log_activity(conn, &workspace_id, "note", &id, title.as_deref(), "hard_deleted", None)
        });
    }

    Ok(())
}

/// Lists notes matching the given query filters with pagination.
#[tauri::command]
pub fn list_notes(
    state: State<'_, AppState>,
    query: NoteQuery,
) -> Result<Vec<NoteListItem>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut sql = String::from(
                "SELECT n.id, n.title, n.date, n.folder, n.category, n.type,
                        n.color, n.importance, n.updated_at, n.created_at, n.body
                 FROM notes n
                 WHERE n.workspace_id = ?1",
            );
            let mut params: Vec<Box<dyn rusqlite::types::ToSql>> =
                vec![Box::new(query.workspace_id.clone())];
            let mut idx = 2;

            if query.only_deleted.unwrap_or(false) {
                sql.push_str(" AND n.deleted_at IS NOT NULL");
            } else if !query.include_deleted.unwrap_or(false) {
                sql.push_str(" AND n.deleted_at IS NULL");
            }

            if let Some(ref folder) = query.folder {
                sql.push_str(&format!(" AND n.folder = ?{}", idx));
                params.push(Box::new(folder.clone()));
                idx += 1;
            }
            if let Some(ref category) = query.category {
                sql.push_str(&format!(" AND n.category = ?{}", idx));
                params.push(Box::new(category.clone()));
                idx += 1;
            }
            if let Some(ref note_type) = query.note_type {
                sql.push_str(&format!(" AND n.type = ?{}", idx));
                params.push(Box::new(note_type.clone()));
                idx += 1;
            }
            if let Some(ref importance) = query.importance {
                sql.push_str(&format!(" AND n.importance = ?{}", idx));
                params.push(Box::new(importance.clone()));
                idx += 1;
            }
            if let Some(ref date_from) = query.date_from {
                sql.push_str(&format!(" AND n.date >= ?{}", idx));
                params.push(Box::new(date_from.clone()));
                idx += 1;
            }
            if let Some(ref date_to) = query.date_to {
                sql.push_str(&format!(" AND n.date <= ?{}", idx));
                params.push(Box::new(date_to.clone()));
                idx += 1;
            }
            if let Some(ref tag) = query.tag {
                sql.push_str(&format!(
                    " AND n.id IN (SELECT nt.note_id FROM note_tags nt
                     INNER JOIN tags t ON t.id = nt.tag_id WHERE t.name = ?{})",
                    idx
                ));
                params.push(Box::new(tag.clone()));
                idx += 1;
            }

            // Sorting
            let sort_col = match query.sort_by.as_deref() {
                Some("title") => "n.title",
                Some("created_at") => "n.created_at",
                Some("date") => "n.date",
                _ => "n.updated_at",
            };
            let sort_dir = match query.sort_order.as_deref() {
                Some("asc") => "ASC",
                _ => "DESC",
            };
            sql.push_str(&format!(" ORDER BY {} {}", sort_col, sort_dir));

            // Pagination
            let limit = query.limit.unwrap_or(50);
            let offset = query.offset.unwrap_or(0);
            sql.push_str(&format!(" LIMIT ?{} OFFSET ?{}", idx, idx + 1));
            params.push(Box::new(limit));
            params.push(Box::new(offset));

            let param_refs: Vec<&dyn rusqlite::types::ToSql> =
                params.iter().map(|p| p.as_ref()).collect();

            let mut stmt = conn.prepare(&sql)?;
            let items = stmt
                .query_map(param_refs.as_slice(), |row| {
                    let body: String = row.get(10)?;
                    Ok(NoteListItem {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        date: row.get(2)?,
                        folder: row.get(3)?,
                        category: row.get(4)?,
                        note_type: row.get(5)?,
                        color: row.get(6)?,
                        importance: row.get(7)?,
                        tags: Vec::new(), // populated below
                        updated_at: row.get(8)?,
                        created_at: row.get(9)?,
                        word_count: word_count(&body),
                        preview: resolve_entity_refs(&body_preview(&body), conn),
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            // Populate tags for each item
            let mut result = Vec::with_capacity(items.len());
            for mut item in items {
                item.tags = get_note_tags(conn, &item.id).map_err(|e| match e {
                    AppError::Database(db_err) => db_err,
                    _ => rusqlite::Error::InvalidQuery,
                })?;
                result.push(item);
            }

            Ok(result)
        })
        .map_err(AppError::Database)
}

/// Builds a virtual folder tree from all distinct folder paths in a workspace.
#[tauri::command]
pub fn get_folder_tree(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<FolderNode>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT folder, COUNT(*) as cnt FROM notes
                 WHERE workspace_id = ?1 AND deleted_at IS NULL AND folder IS NOT NULL
                 GROUP BY folder",
            )?;

            let folder_counts: Vec<(String, i32)> = stmt
                .query_map([&workspace_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(build_folder_tree(&folder_counts))
        })
        .map_err(AppError::Database)
}

/// Constructs a nested `FolderNode` tree from flat folder paths with counts.
fn build_folder_tree(folder_counts: &[(String, i32)]) -> Vec<FolderNode> {
    use std::collections::BTreeMap;

    // Collect all unique path segments and their direct note counts
    let mut path_counts: BTreeMap<String, i32> = BTreeMap::new();
    for (path, count) in folder_counts {
        path_counts.insert(path.clone(), *count);

        // Ensure all parent paths exist in the map
        let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
        for i in 1..parts.len() {
            let parent = format!("/{}", parts[..i].join("/"));
            path_counts.entry(parent).or_insert(0);
        }
    }

    // Build nodes for each unique path
    let mut all_nodes: BTreeMap<String, FolderNode> = BTreeMap::new();
    for (path, count) in &path_counts {
        let name = path
            .rsplit('/')
            .next()
            .unwrap_or(path)
            .to_string();
        all_nodes.insert(
            path.clone(),
            FolderNode {
                path: path.clone(),
                name,
                children: Vec::new(),
                note_count: *count,
            },
        );
    }

    // Determine parent-child relationships
    let paths: Vec<String> = all_nodes.keys().cloned().collect();
    let mut children_map: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut has_parent: std::collections::HashSet<String> = std::collections::HashSet::new();

    for path in &paths {
        let trimmed = path.trim_start_matches('/');
        let parts: Vec<&str> = trimmed.split('/').collect();
        if parts.len() > 1 {
            let parent = format!("/{}", parts[..parts.len() - 1].join("/"));
            children_map
                .entry(parent)
                .or_default()
                .push(path.clone());
            has_parent.insert(path.clone());
        }
    }

    // Recursively build the tree
    fn build_node(
        path: &str,
        all_nodes: &BTreeMap<String, FolderNode>,
        children_map: &BTreeMap<String, Vec<String>>,
    ) -> FolderNode {
        let mut node = all_nodes.get(path).cloned().unwrap_or(FolderNode {
            path: path.to_string(),
            name: path.to_string(),
            children: Vec::new(),
            note_count: 0,
        });

        if let Some(child_paths) = children_map.get(path) {
            for child_path in child_paths {
                node.children
                    .push(build_node(child_path, all_nodes, children_map));
            }
            node.children.sort_by(|a, b| a.name.cmp(&b.name));
        }

        node
    }

    // Return only root-level nodes (those without parents)
    let mut roots: Vec<FolderNode> = Vec::new();
    for path in &paths {
        if !has_parent.contains(path) {
            roots.push(build_node(path, &all_nodes, &children_map));
        }
    }
    roots.sort_by(|a, b| a.name.cmp(&b.name));
    roots
}

/// Gets the daily note for a specific date, if one exists.
#[tauri::command]
pub fn get_daily_note(
    state: State<'_, AppState>,
    workspace_id: String,
    date: String,
) -> Result<Option<Note>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let result = conn.query_row(
                "SELECT id FROM notes
                 WHERE workspace_id = ?1 AND date = ?2 AND deleted_at IS NULL
                 LIMIT 1",
                rusqlite::params![workspace_id, date],
                |row| row.get::<_, String>(0),
            );

            match result {
                Ok(id) => {
                    let note = read_note(conn, &id).map_err(|e| match e {
                        AppError::Database(db_err) => db_err,
                        _ => rusqlite::Error::InvalidQuery,
                    })?;
                    Ok(Some(note))
                }
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(e),
            }
        })
        .map_err(AppError::Database)
}

/// Creates a daily note for the given date, or returns the existing one.
///
/// Daily notes are created with a default title, type "journal", and
/// placed in the "/daily" folder.
#[tauri::command]
pub fn create_daily_note(
    state: State<'_, AppState>,
    workspace_id: String,
    date: String,
) -> Result<Note, AppError> {
    // Check if daily note already exists
    let existing = get_daily_note(state.clone(), workspace_id.clone(), date.clone())?;
    if let Some(note) = existing {
        return Ok(note);
    }

    // Format the date for the title
    let formatted_date = chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map(|d| d.format("%B %-d, %Y").to_string())
        .unwrap_or_else(|_| date.clone());

    let input = CreateNoteInput {
        workspace_id,
        title: Some(format!("Daily Note — {}", formatted_date)),
        date: Some(date),
        body: None,
        folder: Some("/daily".to_string()),
        category: None,
        note_type: Some("journal".to_string()),
        color: None,
        importance: None,
        front_matter: None,
        tags: None,
    };

    create_note(state, input)
}

/// Returns a list of dates (YYYY-MM-DD) in the given month that have notes.
#[tauri::command]
pub fn get_dates_with_notes(
    state: State<'_, AppState>,
    workspace_id: String,
    year: i32,
    month: i32,
) -> Result<Vec<String>, AppError> {
    let date_prefix = format!("{:04}-{:02}", year, month);

    state
        .db
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT DISTINCT date FROM notes
                 WHERE workspace_id = ?1 AND date LIKE ?2 AND deleted_at IS NULL
                 ORDER BY date",
            )?;
            let dates = stmt
                .query_map(
                    rusqlite::params![workspace_id, format!("{}%", date_prefix)],
                    |row| row.get::<_, String>(0),
                )?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(dates)
        })
        .map_err(AppError::Database)
}

/// Moves a note to a different folder.
#[tauri::command]
pub fn move_note_to_folder(
    state: State<'_, AppState>,
    id: String,
    folder: String,
) -> Result<(), AppError> {
    let now = now_iso();
    let affected = state.db.with_conn(|conn| {
        conn.execute(
            "UPDATE notes SET folder = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
            rusqlite::params![folder, now, id],
        )
    })?;

    if affected == 0 {
        return Err(AppError::NotFound {
            entity: "Note".to_string(),
            id,
        });
    }

    // Best-effort activity logging
    let _ = state.db.with_conn(|conn| {
        let meta: Option<(String, Option<String>)> = conn.query_row(
            "SELECT workspace_id, title FROM notes WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).ok();
        if let Some((wid, title)) = meta {
            let details = serde_json::json!({"field": "folder", "new": folder});
            log_activity(conn, &wid, "note", &id, title.as_deref(), "updated", Some(details))?;
        }
        Ok(())
    });

    Ok(())
}

/// Returns the total count of non-deleted notes in a workspace.
#[tauri::command]
pub fn get_note_count(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<i64, AppError> {
    state
        .db
        .with_conn(|conn| {
            conn.query_row(
                "SELECT COUNT(*) FROM notes WHERE workspace_id = ?1 AND deleted_at IS NULL",
                [&workspace_id],
                |row| row.get(0),
            )
        })
        .map_err(AppError::Database)
}
