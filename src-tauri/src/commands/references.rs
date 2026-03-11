use crate::models::reference::{
    Backlink, CreateReference, Reference, ReferenceFilter, VALID_ENTITY_TYPES, VALID_RELATIONS,
    VALID_TARGET_TYPES,
};
use crate::services::references::{diff_references, parse_inline_references};
use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::text::resolve_entity_refs;
use crate::utils::{id::generate_id, time::now_iso};
use tauri::State;

/// Reads a single reference row from the database.
fn read_reference(conn: &rusqlite::Connection, id: &str) -> Result<Reference, AppError> {
    conn.query_row(
        "SELECT id, source_type, source_id, target_type, target_id, target_uri, relation, created_at
         FROM refs WHERE id = ?1",
        [id],
        |row| {
            Ok(Reference {
                id: row.get(0)?,
                source_type: row.get(1)?,
                source_id: row.get(2)?,
                target_type: row.get(3)?,
                target_id: row.get(4)?,
                target_uri: row.get(5)?,
                relation: row.get(6)?,
                created_at: row.get(7)?,
            })
        },
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound {
            entity: "Reference".to_string(),
            id: id.to_string(),
        },
        other => AppError::Database(other),
    })
}

/// Validates entity types and relation for a reference.
fn validate_reference(input: &CreateReference) -> Result<(), AppError> {
    if !VALID_ENTITY_TYPES.contains(&input.source_type.as_str()) {
        return Err(AppError::Validation(format!(
            "Invalid source_type '{}'. Must be one of: {}",
            input.source_type,
            VALID_ENTITY_TYPES.join(", ")
        )));
    }
    if !VALID_TARGET_TYPES.contains(&input.target_type.as_str()) {
        return Err(AppError::Validation(format!(
            "Invalid target_type '{}'. Must be one of: {}",
            input.target_type,
            VALID_TARGET_TYPES.join(", ")
        )));
    }

    let relation = input.relation.as_deref().unwrap_or("references");
    if !VALID_RELATIONS.contains(&relation) {
        return Err(AppError::Validation(format!(
            "Invalid relation '{}'. Must be one of: {}",
            relation,
            VALID_RELATIONS.join(", ")
        )));
    }

    // No self-reference check
    if input.source_type == input.target_type {
        if let Some(ref tid) = input.target_id {
            if *tid == input.source_id {
                return Err(AppError::Validation(
                    "Self-references are not allowed".to_string(),
                ));
            }
        }
    }

    // At least one of target_id or target_uri must be set
    if input.target_id.is_none() && input.target_uri.is_none() {
        return Err(AppError::Validation(
            "Either target_id or target_uri must be provided".to_string(),
        ));
    }

    Ok(())
}

/// Creates a reference between two entities.
///
/// For "blocks", auto-creates inverse "blocked_by".
/// For "related_to", auto-creates inverse "related_to".
/// Rejects duplicate references (same source, target, relation).
#[tauri::command]
pub fn create_reference(
    state: State<'_, AppState>,
    reference: CreateReference,
) -> Result<Reference, AppError> {
    validate_reference(&reference)?;

    let id = generate_id();
    let now = now_iso();
    let relation = reference
        .relation
        .as_deref()
        .unwrap_or("references")
        .to_string();

    state
        .db
        .with_conn(|conn| {
            // Insert the main reference
            conn.execute(
                "INSERT INTO refs (id, source_type, source_id, target_type, target_id, target_uri, relation, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    id,
                    reference.source_type,
                    reference.source_id,
                    reference.target_type,
                    reference.target_id,
                    reference.target_uri,
                    relation,
                    now,
                ],
            ).map_err(|e| {
                if let rusqlite::Error::SqliteFailure(err, _) = &e {
                    if err.code == rusqlite::ffi::ErrorCode::ConstraintViolation {
                        return rusqlite::Error::ToSqlConversionFailure(Box::new(
                            std::io::Error::other("Duplicate reference already exists"),
                        ));
                    }
                }
                e
            })?;

            // Auto-create inverse for "blocks" → "blocked_by"
            if relation == "blocks" {
                if let Some(ref target_id) = reference.target_id {
                    let inv_id = generate_id();
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO refs (id, source_type, source_id, target_type, target_id, target_uri, relation, created_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'blocked_by', ?7)",
                        rusqlite::params![
                            inv_id,
                            reference.target_type,
                            target_id,
                            reference.source_type,
                            reference.source_id,
                            None::<String>,
                            now,
                        ],
                    );
                }
            }

            // Auto-create inverse for "related_to" (symmetric)
            if relation == "related_to" {
                if let Some(ref target_id) = reference.target_id {
                    let inv_id = generate_id();
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO refs (id, source_type, source_id, target_type, target_id, target_uri, relation, created_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'related_to', ?7)",
                        rusqlite::params![
                            inv_id,
                            reference.target_type,
                            target_id,
                            reference.source_type,
                            reference.source_id,
                            None::<String>,
                            now,
                        ],
                    );
                }
            }

            read_reference(conn, &id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })
        })
        .map_err(AppError::Database)
}

/// Deletes a reference by ID.
///
/// If the reference is "blocks", also deletes the inverse "blocked_by".
/// If "related_to", also deletes the inverse.
#[tauri::command]
pub fn delete_reference(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    state
        .db
        .with_conn(|conn| {
            // Read the reference to check for inverse relations
            let reference = read_reference(conn, &id).map_err(|e| match e {
                AppError::Database(db_err) => db_err,
                _ => rusqlite::Error::InvalidQuery,
            })?;

            // Delete the reference
            conn.execute("DELETE FROM refs WHERE id = ?1", [&id])?;

            // Delete inverse references
            if reference.relation == "blocks" || reference.relation == "blocked_by" {
                let inverse_relation = if reference.relation == "blocks" {
                    "blocked_by"
                } else {
                    "blocks"
                };
                if let Some(ref target_id) = reference.target_id {
                    conn.execute(
                        "DELETE FROM refs WHERE source_type = ?1 AND source_id = ?2 AND target_type = ?3 AND target_id = ?4 AND relation = ?5",
                        rusqlite::params![
                            reference.target_type,
                            target_id,
                            reference.source_type,
                            reference.source_id,
                            inverse_relation,
                        ],
                    )?;
                }
            } else if reference.relation == "related_to" {
                if let Some(ref target_id) = reference.target_id {
                    conn.execute(
                        "DELETE FROM refs WHERE source_type = ?1 AND source_id = ?2 AND target_type = ?3 AND target_id = ?4 AND relation = 'related_to'",
                        rusqlite::params![
                            reference.target_type,
                            target_id,
                            reference.source_type,
                            reference.source_id,
                        ],
                    )?;
                }
            }

            Ok(())
        })
        .map_err(AppError::Database)
}

/// Lists references for an entity (outgoing references).
#[tauri::command]
pub fn list_references(
    state: State<'_, AppState>,
    filter: ReferenceFilter,
) -> Result<Vec<Reference>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut sql = String::from(
                "SELECT id, source_type, source_id, target_type, target_id, target_uri, relation, created_at FROM refs WHERE 1=1",
            );
            let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
            let mut idx = 1u32;

            if let Some(ref st) = filter.source_type {
                sql.push_str(&format!(" AND source_type = ?{}", idx));
                params.push(Box::new(st.clone()));
                idx += 1;
            }
            if let Some(ref si) = filter.source_id {
                sql.push_str(&format!(" AND source_id = ?{}", idx));
                params.push(Box::new(si.clone()));
                idx += 1;
            }
            if let Some(ref tt) = filter.target_type {
                sql.push_str(&format!(" AND target_type = ?{}", idx));
                params.push(Box::new(tt.clone()));
                idx += 1;
            }
            if let Some(ref ti) = filter.target_id {
                sql.push_str(&format!(" AND target_id = ?{}", idx));
                params.push(Box::new(ti.clone()));
                idx += 1;
            }
            if let Some(ref rel) = filter.relation {
                sql.push_str(&format!(" AND relation = ?{}", idx));
                params.push(Box::new(rel.clone()));
                idx += 1;
            }

            sql.push_str(" ORDER BY created_at DESC");

            // Limit
            sql.push_str(&format!(" LIMIT ?{}", idx));
            params.push(Box::new(500i64));

            let param_refs: Vec<&dyn rusqlite::types::ToSql> =
                params.iter().map(|p| p.as_ref()).collect();

            let mut stmt = conn.prepare(&sql)?;
            let refs = stmt
                .query_map(param_refs.as_slice(), |row| {
                    Ok(Reference {
                        id: row.get(0)?,
                        source_type: row.get(1)?,
                        source_id: row.get(2)?,
                        target_type: row.get(3)?,
                        target_id: row.get(4)?,
                        target_uri: row.get(5)?,
                        relation: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(refs)
        })
        .map_err(AppError::Database)
}

/// Gets backlinks for an entity (incoming references pointing to it).
///
/// Returns `Backlink` structs with source entity title and context snippet.
#[tauri::command]
pub fn get_backlinks(
    state: State<'_, AppState>,
    target_type: String,
    target_id: String,
) -> Result<Vec<Backlink>, AppError> {
    state
        .db
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, source_type, source_id, target_type, target_id, target_uri, relation, created_at
                 FROM refs
                 WHERE target_type = ?1 AND target_id = ?2
                 ORDER BY created_at DESC",
            )?;

            let refs: Vec<Reference> = stmt
                .query_map(rusqlite::params![target_type, target_id], |row| {
                    Ok(Reference {
                        id: row.get(0)?,
                        source_type: row.get(1)?,
                        source_id: row.get(2)?,
                        target_type: row.get(3)?,
                        target_id: row.get(4)?,
                        target_uri: row.get(5)?,
                        relation: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            let mut backlinks = Vec::with_capacity(refs.len());

            for reference in refs {
                let (title, snippet) = get_source_info(conn, &reference.source_type, &reference.source_id, &target_type, &target_id);
                backlinks.push(Backlink {
                    reference,
                    source_title: title,
                    source_snippet: snippet,
                });
            }

            Ok(backlinks)
        })
        .map_err(AppError::Database)
}

/// Retrieves the title and a context snippet for a source entity.
fn get_source_info(
    conn: &rusqlite::Connection,
    source_type: &str,
    source_id: &str,
    _target_type: &str,
    target_id: &str,
) -> (String, Option<String>) {
    match source_type {
        "note" => {
            let result = conn.query_row(
                "SELECT title, body FROM notes WHERE id = ?1",
                [source_id],
                |row| {
                    let title: Option<String> = row.get(0)?;
                    let body: String = row.get(1)?;
                    Ok((title, body))
                },
            );
            match result {
                Ok((title, body)) => {
                    let title = title.unwrap_or_else(|| "Untitled".to_string());
                    let snippet = extract_snippet(&body, target_id, conn);
                    (title, snippet)
                }
                Err(_) => ("Unknown".to_string(), None),
            }
        }
        "task" => {
            let result = conn.query_row(
                "SELECT title, description FROM tasks WHERE id = ?1",
                [source_id],
                |row| {
                    let title: String = row.get(0)?;
                    let desc: Option<String> = row.get(1)?;
                    Ok((title, desc))
                },
            );
            match result {
                Ok((title, desc)) => {
                    let snippet = desc.as_deref().and_then(|d| extract_snippet(d, target_id, conn));
                    (title, snippet)
                }
                Err(_) => ("Unknown".to_string(), None),
            }
        }
        "plan" => {
            let result = conn.query_row(
                "SELECT title, description FROM plans WHERE id = ?1",
                [source_id],
                |row| {
                    let title: String = row.get(0)?;
                    let desc: Option<String> = row.get(1)?;
                    Ok((title, desc))
                },
            );
            match result {
                Ok((title, desc)) => {
                    let snippet = desc.as_deref().and_then(|d| extract_snippet(d, target_id, conn));
                    (title, snippet)
                }
                Err(_) => ("Unknown".to_string(), None),
            }
        }
        _ => ("Unknown".to_string(), None),
    }
}

/// Extracts a context snippet around a reference target ID from a body of text.
/// Entity references (`@task[uuid]`, etc.) are resolved to their titles.
fn extract_snippet(body: &str, target_id: &str, conn: &rusqlite::Connection) -> Option<String> {
    // Find the position of the target_id in the body
    if let Some(pos) = body.find(target_id) {
        let start = pos.saturating_sub(40);
        let end = (pos + target_id.len() + 40).min(body.len());
        let snippet = &body[start..end];
        let snippet = snippet.replace('\n', " ");
        let resolved = resolve_entity_refs(&snippet, conn);
        Some(format!("...{}...", resolved.trim()))
    } else {
        // Return first 100 chars as fallback
        let preview: String = body.chars().take(100).collect();
        if preview.is_empty() {
            None
        } else {
            Some(resolve_entity_refs(&preview, conn))
        }
    }
}

/// Syncs inline references for a note.
///
/// Parses the note body for `@task[id]`, `@note[id]`, `@plan[id]`, `@time_entry[id]` patterns.
/// Diffs against existing references: creates new ones, deletes stale ones.
/// Only manages auto-created "references" relations; manual relations are preserved.
#[tauri::command]
pub fn sync_note_references(
    state: State<'_, AppState>,
    note_id: String,
    body: String,
) -> Result<Vec<Reference>, AppError> {
    let parsed = parse_inline_references(&body);

    state
        .db
        .with_conn(|conn| {
            // Get existing auto-references from this note
            let mut stmt = conn.prepare(
                "SELECT id, source_type, source_id, target_type, target_id, target_uri, relation, created_at
                 FROM refs
                 WHERE source_type = 'note' AND source_id = ?1",
            )?;

            let existing: Vec<Reference> = stmt
                .query_map([&note_id], |row| {
                    Ok(Reference {
                        id: row.get(0)?,
                        source_type: row.get(1)?,
                        source_id: row.get(2)?,
                        target_type: row.get(3)?,
                        target_id: row.get(4)?,
                        target_uri: row.get(5)?,
                        relation: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            let (to_create, to_delete) =
                diff_references(&existing, &parsed, "note", &note_id);

            // Delete stale references
            for del_id in &to_delete {
                conn.execute("DELETE FROM refs WHERE id = ?1", [del_id])?;
            }

            // Create new references (only for targets that exist)
            let now = crate::utils::time::now_iso();
            for create_ref in &to_create {
                let target_exists = match create_ref.target_type.as_str() {
                    "task" => {
                        if let Some(ref tid) = create_ref.target_id {
                            conn.query_row(
                                "SELECT COUNT(*) FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                                [tid],
                                |row| row.get::<_, i64>(0),
                            )
                            .unwrap_or(0)
                                > 0
                        } else {
                            false
                        }
                    }
                    "note" => {
                        if let Some(ref tid) = create_ref.target_id {
                            conn.query_row(
                                "SELECT COUNT(*) FROM notes WHERE id = ?1 AND deleted_at IS NULL",
                                [tid],
                                |row| row.get::<_, i64>(0),
                            )
                            .unwrap_or(0)
                                > 0
                        } else {
                            false
                        }
                    }
                    "plan" => {
                        if let Some(ref tid) = create_ref.target_id {
                            conn.query_row(
                                "SELECT COUNT(*) FROM plans WHERE id = ?1 AND deleted_at IS NULL",
                                [tid],
                                |row| row.get::<_, i64>(0),
                            )
                            .unwrap_or(0)
                                > 0
                        } else {
                            false
                        }
                    }
                    "time_entry" => {
                        if let Some(ref tid) = create_ref.target_id {
                            conn.query_row(
                                "SELECT COUNT(*) FROM time_entries WHERE id = ?1 AND deleted_at IS NULL",
                                [tid],
                                |row| row.get::<_, i64>(0),
                            )
                            .unwrap_or(0)
                                > 0
                        } else {
                            false
                        }
                    }
                    _ => false,
                };

                if target_exists {
                    let ref_id = crate::utils::id::generate_id();
                    conn.execute(
                        "INSERT OR IGNORE INTO refs (id, source_type, source_id, target_type, target_id, target_uri, relation, created_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        rusqlite::params![
                            ref_id,
                            create_ref.source_type,
                            create_ref.source_id,
                            create_ref.target_type,
                            create_ref.target_id,
                            create_ref.target_uri,
                            create_ref.relation.as_deref().unwrap_or("references"),
                            now,
                        ],
                    )?;
                }
            }

            // Return all current references for this note
            let mut stmt2 = conn.prepare(
                "SELECT id, source_type, source_id, target_type, target_id, target_uri, relation, created_at
                 FROM refs
                 WHERE source_type = 'note' AND source_id = ?1
                 ORDER BY created_at DESC",
            )?;

            let result: Vec<Reference> = stmt2
                .query_map([&note_id], |row| {
                    Ok(Reference {
                        id: row.get(0)?,
                        source_type: row.get(1)?,
                        source_id: row.get(2)?,
                        target_type: row.get(3)?,
                        target_id: row.get(4)?,
                        target_uri: row.get(5)?,
                        relation: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(result)
        })
        .map_err(AppError::Database)
}
