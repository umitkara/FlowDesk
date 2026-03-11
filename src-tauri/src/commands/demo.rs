/// Demo workspace seed command.
///
/// Inserts a fully pre-populated "FlowDesk Demo" workspace so that first-time
/// users can explore all features without having to create content themselves.
use crate::state::AppState;
use crate::utils::errors::AppError;
use crate::utils::id::generate_id;
use crate::utils::time::now_iso;
use chrono::{Duration, Utc};
use tauri::State;

/// Seeds a complete demo workspace and returns the new workspace ID.
///
/// The workspace is populated with realistic sample data covering notes, tasks,
/// plans, time entries, tags, and cross-entity references.
#[tauri::command]
pub fn seed_demo_workspace(state: State<'_, AppState>) -> Result<String, AppError> {
    state.db.with_conn(do_seed).map_err(AppError::from)
}

/// Returns a Tiptap-compatible entity reference span.
fn eref(entity_type: &str, id: &str) -> String {
    format!(
        r#"<span data-entity-ref="" data-entity-type="{entity_type}" data-entity-id="{id}">@{entity_type}[{id}]</span>"#
    )
}

fn do_seed(conn: &rusqlite::Connection) -> Result<String, rusqlite::Error> {
    let now = now_iso();

    // --- Date helpers ---
    let today = Utc::now().date_naive();
    let yesterday = today - Duration::days(1);
    let tomorrow = today + Duration::days(1);
    let today_plus_3 = today + Duration::days(3);
    let today_plus_6 = today + Duration::days(6);
    let today_plus_8 = today + Duration::days(8);
    let today_plus_13 = today + Duration::days(13);
    let today_plus_20 = today + Duration::days(20);

    let today_str = today.format("%Y-%m-%d").to_string();
    let yesterday_str = yesterday.format("%Y-%m-%d").to_string();
    let tomorrow_str = tomorrow.format("%Y-%m-%d").to_string();
    let today_plus_3_str = today_plus_3.format("%Y-%m-%d").to_string();
    let today_plus_6_str = today_plus_6.format("%Y-%m-%d").to_string();
    let today_plus_8_str = today_plus_8.format("%Y-%m-%d").to_string();
    let today_plus_13_str = today_plus_13.format("%Y-%m-%d").to_string();
    let today_plus_20_str = today_plus_20.format("%Y-%m-%d").to_string();

    // ISO datetime strings for plans and time entries
    let today_09_00 = format!("{}T09:00:00Z", today_str);
    let today_10_55 = format!("{}T10:55:00Z", today_str);
    let today_11_00 = format!("{}T11:00:00Z", today_str);
    let today_11_28 = format!("{}T11:28:00Z", today_str);
    let today_11_30 = format!("{}T11:30:00Z", today_str);
    let today_14_00 = format!("{}T14:00:00Z", today_str);
    let today_15_30 = format!("{}T15:30:00Z", today_str);
    let yesterday_09_15 = format!("{}T09:15:00Z", yesterday_str);
    let yesterday_11_00 = format!("{}T11:00:00Z", yesterday_str);
    let yesterday_10_00 = format!("{}T10:00:00Z", yesterday_str);
    let yesterday_12_00 = format!("{}T12:00:00Z", yesterday_str);
    let yesterday_14_00 = format!("{}T14:00:00Z", yesterday_str);
    let yesterday_14_45 = format!("{}T14:45:00Z", yesterday_str);
    let today_plus_8_10_00 = format!("{}T10:00:00Z", today_plus_8_str);
    let today_plus_8_11_00 = format!("{}T11:00:00Z", today_plus_8_str);
    let today_plus_20_00_00 = format!("{}T00:00:00Z", today_plus_20_str);

    // =====================================================================
    // PRE-GENERATE ALL IDs so note bodies can embed entity refs by ID
    // =====================================================================

    let ws_id = generate_id();

    // Note IDs
    let n1 = generate_id(); // Getting Started with FlowDesk
    let n2 = generate_id(); // Weekly Team Standup
    let n3 = generate_id(); // Project Alpha: Architecture Notes
    let n4 = generate_id(); // Daily Journal
    let n5 = generate_id(); // Research: PKM
    let n6 = generate_id(); // Q2 Planning Notes
    let n7 = generate_id(); // UI Component Sketches
    let n8 = generate_id(); // Reading List

    // Task IDs — done (4)
    let t_setup      = generate_id();
    let t_schema     = generate_id();
    let t_editor     = generate_id();
    let t_release    = generate_id();
    // in_progress (3)
    let t_darkmode   = generate_id();
    let t_search_fix = generate_id();
    let t_refactor   = generate_id();
    // todo (4)
    let t_shortcuts  = generate_id();
    let t_docs       = generate_id();
    let t_csv        = generate_id();
    let t_profiling  = generate_id();
    // inbox (3)
    let t_prs        = generate_id();
    let t_deps       = generate_id();
    let t_macos      = generate_id();
    // cancelled (1)
    let t_old_auth   = generate_id();
    // subtask
    let t_css_vars   = generate_id();

    // Plan IDs
    let p_deep_work   = generate_id();
    let p_standup     = generate_id();
    let p_code_review = generate_id();
    let p_planning    = generate_id();
    let p_q2_kickoff  = generate_id();
    let p_monthly     = generate_id();

    // =====================================================================
    // 1. WORKSPACE
    // =====================================================================
    let config_json = r##"{"categories":["work","personal","learning"],"note_types":["journal","meeting","technical","reference","draft"],"task_categories":["feature","bug","research","chore"],"dashboard_widgets":["today_plan","pending_tasks","recent_notes","time_today","sticky_tasks","upcoming_deadlines"],"accent_color":"#8b5cf6"}"##;

    // Generate a unique slug in case multiple demo workspaces are created.
    let slug = {
        let base = "flowdesk-demo";
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM workspaces WHERE slug = ?1",
                rusqlite::params![base],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;
        if exists {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM workspaces WHERE slug LIKE 'flowdesk-demo%'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(1);
            format!("{}-{}", base, count + 1)
        } else {
            base.to_string()
        }
    };

    conn.execute(
        "INSERT INTO workspaces (id, name, slug, icon, color, sort_order, config, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            ws_id,
            "FlowDesk Demo",
            slug,
            "🎯",
            "#8b5cf6",
            99,
            config_json,
            now,
            now,
        ],
    )?;

    // =====================================================================
    // 2. TAGS
    // =====================================================================
    let tag_defs: &[(&str, &str)] = &[
        ("guide",         "#10b981"),
        ("overview",      "#6366f1"),
        ("team",          "#3b82f6"),
        ("standup",       "#0ea5e9"),
        ("architecture",  "#f59e0b"),
        ("backend",       "#ef4444"),
        ("research",      "#8b5cf6"),
        ("pkm",           "#ec4899"),
        ("planning",      "#14b8a6"),
        ("q2",            "#f97316"),
        ("design",        "#a855f7"),
        ("ideas",         "#06b6d4"),
        ("books",         "#84cc16"),
        ("learning",      "#22d3ee"),
        ("feature",       "#3b82f6"),
        ("ui",            "#8b5cf6"),
        ("bug",           "#ef4444"),
        ("refactor",      "#f59e0b"),
        ("docs",          "#10b981"),
        ("export",        "#6366f1"),
        ("chore",         "#94a3b8"),
        ("testing",       "#ec4899"),
        ("focus",         "#10b981"),
        ("code",          "#3b82f6"),
    ];

    let mut tag_ids: std::collections::HashMap<&str, String> = std::collections::HashMap::new();
    for (name, color) in tag_defs {
        let tag_id = generate_id();
        conn.execute(
            "INSERT OR IGNORE INTO tags (id, workspace_id, name, color, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![tag_id, ws_id, name, color, now],
        )?;
        let actual_id: String = conn.query_row(
            "SELECT id FROM tags WHERE workspace_id = ?1 AND name = ?2",
            rusqlite::params![ws_id, name],
            |row| row.get(0),
        )?;
        tag_ids.insert(name, actual_id);
    }

    // =====================================================================
    // 3. NOTES  (bodies as Tiptap HTML with embedded entity ref spans)
    // =====================================================================

    let body_n1 = format!(
        concat!(
            "<h2>Welcome to FlowDesk</h2>",
            "<p>FlowDesk is a local-first workspace for notes, tasks, plans, and time tracking. ",
            "This demo workspace is pre-populated so you can explore every feature right away.</p>",
            "<h3>What&#39;s in this demo</h3>",
            "<ul>",
            "<li><p>8 notes across different types and folders</p></li>",
            "<li><p>15 tasks spread across all Kanban columns</p></li>",
            "<li><p>6 plans on the calendar (today, yesterday, and upcoming)</p></li>",
            "<li><p>5 time tracking sessions with category breakdowns</p></li>",
            "</ul>",
            "<h3>Current focus</h3>",
            "<p>The highest-priority in-progress task: {} — a subtask for CSS variables is tracked separately.</p>",
            "<h3>Tips</h3>",
            "<ul>",
            "<li><p>Open the <strong>Command Palette</strong> with <code>Ctrl+K</code> to jump anywhere.</p></li>",
            "<li><p>The <strong>Graph view</strong> (Discovery sidebar) shows how all entities connect.</p></li>",
            "<li><p>Type <code>@</code> in any note body to reference a task, note, or plan inline.</p></li>",
            "</ul>"
        ),
        eref("task", &t_darkmode)
    );

    let body_n2 = format!(
        concat!(
            "<h2>Weekly Team Standup — {}</h2>",
            "<p><strong>Attendees:</strong> Alice, Bob, Carol, Dave</p>",
            "<h3>Yesterday</h3>",
            "<ul>",
            "<li><p>Completed the architecture review for Project Alpha</p></li>",
            "<li><p>Investigated and patched the search performance regression: {}</p></li>",
            "</ul>",
            "<h3>Today</h3>",
            "<ul>",
            "<li><p>Continue dark mode implementation: {}</p></li>",
            "<li><p>Start the Q2 planning document</p></li>",
            "</ul>",
            "<h3>Blockers</h3>",
            "<ul>",
            "<li><p>Waiting on design assets for the new dashboard widgets</p></li>",
            "</ul>"
        ),
        yesterday_str,
        eref("task", &t_search_fix),
        eref("task", &t_darkmode)
    );

    let body_n3 = format!(
        concat!(
            "<h2>Overview</h2>",
            "<p>Project Alpha uses a layered architecture: a Tauri shell, a Rust backend, ",
            "and a React frontend communicating via typed IPC commands.</p>",
            "<h2>Key Decisions</h2>",
            "<ul>",
            "<li><p>SQLite for local persistence (bundled via rusqlite)</p></li>",
            "<li><p>Zustand for frontend state management</p></li>",
            "<li><p>Tiptap for rich-text editing with custom node extensions</p></li>",
            "</ul>",
            "<h2>Open Issues</h2>",
            "<p>Urgent: {} — needs investigation before the beta launch deadline.</p>",
            "<p>In progress: {} — subtask {} is tracked separately.</p>",
            "<h2>Performance Notes</h2>",
            "<ul>",
            "<li><p>FTS5 virtual tables on notes, tasks, and plans for full-text search</p></li>",
            "<li><p>WAL journal mode for crash safety and concurrent reads</p></li>",
            "<li><p>Connection pool serialises access via a single Mutex&lt;Connection&gt;</p></li>",
            "</ul>"
        ),
        eref("task", &t_search_fix),
        eref("task", &t_darkmode),
        eref("task", &t_css_vars)
    );

    let body_n4 = format!(
        concat!(
            "<h2>Morning Reflection — {}</h2>",
            "<p>Focused on the demo workspace seed today. The time entry schema requires careful ",
            "handling of the pauses JSON array to compute <code>active_mins</code> correctly.</p>",
            "<h3>Goals for today</h3>",
            "<ol>",
            "<li><p>Finish the backend seed command</p></li>",
            "<li><p>Wire up the frontend button in WorkspaceCreate</p></li>",
            "<li><p>Run <code>cargo clippy</code> and <code>tsc --noEmit</code> — target: zero warnings</p></li>",
            "</ol>",
            "<h3>Plan for this morning</h3>",
            "<p>Blocking out 09:00–11:00 for deep work: {}</p>",
            "<h3>Evening</h3>",
            "<p>All done. Zero warnings. The demo workspace loads with all 15 tasks, 8 notes, ",
            "6 plans, and 5 time entries correctly connected.</p>"
        ),
        today_str,
        eref("plan", &p_deep_work)
    );

    let body_n5 = concat!(
        "<h2>PKM Systems Overview</h2>",
        "<p>Exploring different approaches to personal knowledge management:</p>",
        "<h3>Zettelkasten</h3>",
        "<p>Atomic notes with bidirectional links. Good for building a long-term knowledge base ",
        "that compounds over time. Each note should express exactly one idea.</p>",
        "<h3>PARA</h3>",
        "<p>Projects, Areas, Resources, Archives. Great for organising actionable information ",
        "by its relevance to current goals.</p>",
        "<h3>Building a Second Brain</h3>",
        "<p>Focuses on the CODE framework: <strong>C</strong>apture, <strong>O</strong>rganise, ",
        "<strong>D</strong>istill, <strong>E</strong>xpress.</p>",
        "<h2>FlowDesk&#39;s Approach</h2>",
        "<p>FlowDesk combines all three: notes as atomic units, tasks and plans for action, ",
        "workspaces for PARA-style organisation, and the Graph view for Zettelkasten-style ",
        "link discovery.</p>",
        "<h2>Key Reading</h2>",
        "<ul>",
        "<li><p><em>How to Take Smart Notes</em> — Sönke Ahrens (best intro to Zettelkasten)</p></li>",
        "<li><p><em>Building a Second Brain</em> — Tiago Forte</p></li>",
        "</ul>"
    ).to_string();

    let body_n6 = format!(
        concat!(
            "<h2>Q2 Goals</h2>",
            "<ol>",
            "<li><p>Ship the export improvements (CSV + JSON workspace export)</p></li>",
            "<li><p>Complete dark mode across all views: {}</p></li>",
            "<li><p>Launch the public beta</p></li>",
            "</ol>",
            "<h2>Key Milestones</h2>",
            "<ul>",
            "<li><p><strong>Apr 1:</strong> Feature freeze</p></li>",
            "<li><p><strong>Apr 15:</strong> Beta launch</p></li>",
            "<li><p><strong>May 1:</strong> v1.0 release</p></li>",
            "</ul>",
            "<h2>Kickoff Event</h2>",
            "<p>All-hands Q2 kickoff: {}</p>",
            "<h2>Resource Allocation</h2>",
            "<ul>",
            "<li><p>2 engineers on features</p></li>",
            "<li><p>1 engineer on infrastructure and reliability</p></li>",
            "<li><p>Design contractor for the landing page</p></li>",
            "</ul>"
        ),
        eref("task", &t_darkmode),
        eref("plan", &p_q2_kickoff)
    );

    let body_n7 = concat!(
        "<h2>Components in Progress</h2>",
        "<ul>",
        "<li><p><strong>CommandPalette</strong> — fuzzy search overlay, triggered with <code>Ctrl+K</code></p></li>",
        "<li><p><strong>KanbanBoard</strong> — drag-and-drop task columns with priority badges and sticky indicators</p></li>",
        "<li><p><strong>GraphView</strong> — force-directed graph showing entity relationships</p></li>",
        "<li><p><strong>TimelineView</strong> — chronological view of plans and time entries</p></li>",
        "</ul>",
        "<h2>Design Tokens</h2>",
        "<p>Using CSS custom properties for workspace-level theming:</p>",
        "<ul>",
        "<li><p><code>--workspace-accent</code>: primary action colour</p></li>",
        "<li><p><code>--workspace-accent-light</code>: hover states</p></li>",
        "<li><p><code>--workspace-accent-dark</code>: active / pressed states</p></li>",
        "</ul>",
        "<h2>Open TODOs</h2>",
        "<ul>",
        "<li><p>Add drag animation on kanban card pickup</p></li>",
        "<li><p>Mobile-friendly breakpoints for the sidebar</p></li>",
        "<li><p>Contrast ratio audit for dark mode colour tokens</p></li>",
        "</ul>"
    ).to_string();

    let body_n8 = concat!(
        "<h2>Currently Reading</h2>",
        "<ul>",
        "<li><p><em>How to Take Smart Notes</em> — Sönke Ahrens</p></li>",
        "<li><p><em>A Philosophy of Software Design</em> — John Ousterhout</p></li>",
        "</ul>",
        "<h2>To Read</h2>",
        "<ul>",
        "<li><p><em>Thinking in Systems</em> — Donella Meadows</p></li>",
        "<li><p><em>The Pragmatic Programmer</em> — Hunt &amp; Thomas</p></li>",
        "<li><p><em>Staff Engineer</em> — Will Larson</p></li>",
        "</ul>",
        "<h2>Recently Finished</h2>",
        "<ul>",
        "<li><p><em>Shape Up</em> — Ryan Singer ⭐⭐⭐⭐⭐</p></li>",
        "<li><p><em>The Manager's Path</em> — Camille Fournier ⭐⭐⭐⭐</p></li>",
        "</ul>"
    ).to_string();

    // Insert notes
    // Columns: id, workspace_id, title, date, body, folder, type, importance, created_at, updated_at, pinned
    type NoteRow<'a> = (&'a str, &'a str, &'a str, &'a str, &'a str, Option<&'a str>, Option<&'a str>, i64);
    let notes: &[NoteRow<'_>] = &[
        (&n1, "Getting Started with FlowDesk", &today_str, &body_n1, "/overview", Some("reference"), Some("high"), 1),
        (&n2, "Weekly Team Standup", &yesterday_str, &body_n2, "/meetings", Some("meeting"), None, 0),
        (&n3, "Project Alpha: Architecture Notes", &today_str, &body_n3, "/projects/alpha", Some("technical"), Some("high"), 0),
        (&n4, "Daily Journal", &today_str, &body_n4, "/daily", Some("journal"), None, 0),
        (&n5, "Research: Personal Knowledge Management", &today_str, &body_n5, "", Some("reference"), None, 0),
        (&n6, "Q2 Planning Notes", &today_str, &body_n6, "", Some("reference"), Some("critical"), 1),
        (&n7, "UI Component Sketches", &today_str, &body_n7, "/projects/alpha", Some("draft"), None, 0),
        (&n8, "Reading List", &today_str, &body_n8, "/personal", Some("reference"), None, 0),
    ];

    for (id, title, date, body, folder, ntype, importance, pinned) in notes {
        let folder_val: Option<&str> = if folder.is_empty() { None } else { Some(folder) };
        conn.execute(
            "INSERT INTO notes (id, workspace_id, title, date, body, folder, type, importance, created_at, updated_at, pinned)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![id, ws_id, title, date, body, folder_val, ntype, importance, now, now, pinned],
        )?;
    }

    // Note tags
    let note_tag_map: &[(&str, &[&str])] = &[
        (&n1, &["guide", "overview"]),
        (&n2, &["team", "standup"]),
        (&n3, &["architecture", "backend"]),
        (&n5, &["research", "pkm"]),
        (&n6, &["planning", "q2"]),
        (&n7, &["design", "ideas"]),
        (&n8, &["books", "learning"]),
    ];

    for (note_id, tags) in note_tag_map {
        for tag_name in *tags {
            if let Some(tid) = tag_ids.get(tag_name) {
                conn.execute(
                    "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                    rusqlite::params![note_id, tid],
                )?;
            }
        }
    }

    // =====================================================================
    // 4. TASKS  (parents before subtask)
    // =====================================================================

    // done (4)
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,completed_at,created_at,updated_at,tags,actual_mins)
         VALUES (?1,?2,?3,'done','low',?4,?5,?6,'[]',0)",
        rusqlite::params![t_setup, ws_id, "Set up dev environment", &yesterday_str, now, now],
    )?;
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,completed_at,created_at,updated_at,tags,actual_mins)
         VALUES (?1,?2,?3,'done','medium',?4,?5,?6,'[]',0)",
        rusqlite::params![t_schema, ws_id, "Design database schema", &yesterday_str, now, now],
    )?;
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,completed_at,created_at,updated_at,tags,actual_mins)
         VALUES (?1,?2,?3,'done','high',?4,?5,?6,'[]',0)",
        rusqlite::params![t_editor, ws_id, "Implement note editor", &yesterday_str, now, now],
    )?;
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,completed_at,created_at,updated_at,tags,actual_mins)
         VALUES (?1,?2,?3,'done','medium',?4,?5,?6,'[]',0)",
        rusqlite::params![t_release, ws_id, "Write release notes", &yesterday_str, now, now],
    )?;

    // in_progress (3)
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,due_date,tags,is_sticky,created_at,updated_at,actual_mins)
         VALUES (?1,?2,?3,'in_progress','high',?4,'[\"feature\",\"ui\"]',0,?5,?6,0)",
        rusqlite::params![t_darkmode, ws_id, "Add dark mode support", &today_plus_3_str, now, now],
    )?;
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,due_date,tags,is_sticky,created_at,updated_at,actual_mins)
         VALUES (?1,?2,?3,'in_progress','urgent',?4,'[\"bug\"]',1,?5,?6,0)",
        rusqlite::params![t_search_fix, ws_id, "Fix search performance", &tomorrow_str, now, now],
    )?;
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,tags,is_sticky,created_at,updated_at,actual_mins)
         VALUES (?1,?2,?3,'in_progress','medium','[\"refactor\"]',0,?4,?5,0)",
        rusqlite::params![t_refactor, ws_id, "Refactor task store", now, now],
    )?;

    // todo (4)
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,due_date,tags,created_at,updated_at,actual_mins)
         VALUES (?1,?2,?3,'todo','medium',?4,'[]',?5,?6,0)",
        rusqlite::params![t_shortcuts, ws_id, "Add keyboard shortcuts guide", &today_plus_8_str, now, now],
    )?;
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,tags,created_at,updated_at,actual_mins)
         VALUES (?1,?2,?3,'todo','low','[\"docs\"]',?4,?5,0)",
        rusqlite::params![t_docs, ws_id, "Write user documentation", now, now],
    )?;
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,due_date,tags,created_at,updated_at,actual_mins)
         VALUES (?1,?2,?3,'todo','high',?4,'[\"feature\",\"export\"]',?5,?6,0)",
        rusqlite::params![t_csv, ws_id, "CSV export improvements", &today_plus_6_str, now, now],
    )?;
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,due_date,tags,created_at,updated_at,actual_mins)
         VALUES (?1,?2,?3,'todo','medium',?4,'[]',?5,?6,0)",
        rusqlite::params![t_profiling, ws_id, "Performance profiling", &today_plus_13_str, now, now],
    )?;

    // inbox (3)
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,tags,is_sticky,created_at,updated_at,actual_mins)
         VALUES (?1,?2,?3,'inbox','none','[]',1,?4,?5,0)",
        rusqlite::params![t_prs, ws_id, "Review pull requests", now, now],
    )?;
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,tags,created_at,updated_at,actual_mins)
         VALUES (?1,?2,?3,'inbox','low','[\"chore\"]',?4,?5,0)",
        rusqlite::params![t_deps, ws_id, "Update dependencies", now, now],
    )?;
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,tags,created_at,updated_at,actual_mins)
         VALUES (?1,?2,?3,'inbox','medium','[\"testing\"]',?4,?5,0)",
        rusqlite::params![t_macos, ws_id, "Test on macOS", now, now],
    )?;

    // cancelled (1)
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,tags,created_at,updated_at,actual_mins)
         VALUES (?1,?2,?3,'cancelled','low','[]',?4,?5,0)",
        rusqlite::params![t_old_auth, ws_id, "Old authentication approach", now, now],
    )?;

    // subtask of t_darkmode
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,tags,parent_task_id,created_at,updated_at,actual_mins)
         VALUES (?1,?2,?3,'todo','medium','[]',?4,?5,?6,0)",
        rusqlite::params![t_css_vars, ws_id, "Update CSS variables", t_darkmode, now, now],
    )?;

    // =====================================================================
    // 5. PLANS
    // =====================================================================

    conn.execute(
        "INSERT INTO plans (id,workspace_id,title,start_time,end_time,all_day,type,color,tags,status,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,0,'time_block','#3b82f6','[\"focus\"]','scheduled',?6,?7)",
        rusqlite::params![p_deep_work, ws_id, "Morning Deep Work", today_09_00, today_11_00, now, now],
    )?;
    conn.execute(
        "INSERT INTO plans (id,workspace_id,title,start_time,end_time,all_day,type,color,tags,status,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,0,'event','#10b981','[\"team\"]','scheduled',?6,?7)",
        rusqlite::params![p_standup, ws_id, "Team Standup", today_11_00, today_11_30, now, now],
    )?;
    conn.execute(
        "INSERT INTO plans (id,workspace_id,title,start_time,end_time,all_day,type,color,tags,status,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,0,'time_block','#6366f1','[\"code\"]','scheduled',?6,?7)",
        rusqlite::params![p_code_review, ws_id, "Code Review Session", today_14_00, today_15_30, now, now],
    )?;
    conn.execute(
        "INSERT INTO plans (id,workspace_id,title,start_time,end_time,all_day,type,tags,status,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,0,'time_block','[]','completed',?6,?7)",
        rusqlite::params![p_planning, ws_id, "Project Planning Session", yesterday_10_00, yesterday_12_00, now, now],
    )?;
    conn.execute(
        "INSERT INTO plans (id,workspace_id,title,start_time,end_time,all_day,type,importance,tags,status,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,0,'event','high','[]','scheduled',?6,?7)",
        rusqlite::params![p_q2_kickoff, ws_id, "Q2 Kickoff Meeting", today_plus_8_10_00, today_plus_8_11_00, now, now],
    )?;
    conn.execute(
        "INSERT INTO plans (id,workspace_id,title,start_time,end_time,all_day,type,tags,status,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,1,'daily_plan','[]','scheduled',?6,?7)",
        rusqlite::params![p_monthly, ws_id, "Monthly Review", today_plus_20_00_00, today_plus_20_00_00, now, now],
    )?;

    // =====================================================================
    // 6. TIME ENTRIES
    // =====================================================================

    let te1 = generate_id();
    let te2 = generate_id();
    let te3 = generate_id();
    let te4 = generate_id();
    let te5 = generate_id();

    // Yesterday 09:15–11:00 (105 min) — development — linked to t_refactor task
    conn.execute(
        "INSERT INTO time_entries (id,workspace_id,start_time,end_time,pauses,active_mins,notes,category,tags,session_notes,linked_task_id,created_at,updated_at)
         VALUES (?1,?2,?3,?4,'[]',105,'','development','[]','[]',?5,?6,?7)",
        rusqlite::params![te1, ws_id, yesterday_09_15, yesterday_11_00, t_refactor, now, now],
    )?;

    // Yesterday 14:00–14:45 (45 min) — research — no link
    conn.execute(
        "INSERT INTO time_entries (id,workspace_id,start_time,end_time,pauses,active_mins,notes,category,tags,session_notes,created_at,updated_at)
         VALUES (?1,?2,?3,?4,'[]',45,'','research','[]','[]',?5,?6)",
        rusqlite::params![te2, ws_id, yesterday_14_00, yesterday_14_45, now, now],
    )?;

    // Today 09:00–10:55 (115 min) — development — linked to p_deep_work plan
    conn.execute(
        "INSERT INTO time_entries (id,workspace_id,start_time,end_time,pauses,active_mins,notes,category,tags,session_notes,linked_plan_id,created_at,updated_at)
         VALUES (?1,?2,?3,?4,'[]',115,'','development','[]','[]',?5,?6,?7)",
        rusqlite::params![te3, ws_id, today_09_00, today_10_55, p_deep_work, now, now],
    )?;

    // Today 11:00–11:28 (28 min) — meetings — linked to p_standup plan
    conn.execute(
        "INSERT INTO time_entries (id,workspace_id,start_time,end_time,pauses,active_mins,notes,category,tags,session_notes,linked_plan_id,created_at,updated_at)
         VALUES (?1,?2,?3,?4,'[]',28,'','meetings','[]','[]',?5,?6,?7)",
        rusqlite::params![te4, ws_id, today_11_00, today_11_28, p_standup, now, now],
    )?;

    // Today 14:00–15:30 (90 min) — code-review — linked to p_code_review plan
    conn.execute(
        "INSERT INTO time_entries (id,workspace_id,start_time,end_time,pauses,active_mins,notes,category,tags,session_notes,linked_plan_id,created_at,updated_at)
         VALUES (?1,?2,?3,?4,'[]',90,'','code-review','[]','[]',?5,?6,?7)",
        rusqlite::params![te5, ws_id, today_14_00, today_15_30, p_code_review, now, now],
    )?;

    // =====================================================================
    // 7. REFS
    // =====================================================================

    let ref_defs: &[(&str, &str, &str, &str, &str)] = &[
        (&n3, "note", &t_search_fix, "task", "references"),
        (&n1, "note", &t_darkmode,   "task", "references"),
        (&n6, "note", &p_q2_kickoff, "plan", "references"),
        (&t_darkmode, "task", &t_css_vars, "task", "subtask_of"),
    ];

    for (source_id, source_type, target_id, target_type, relation) in ref_defs {
        let ref_id = generate_id();
        conn.execute(
            "INSERT INTO refs (id, source_type, source_id, target_type, target_id, relation,
                               created_at, source_workspace_id, target_workspace_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            rusqlite::params![
                ref_id, source_type, source_id, target_type, target_id,
                relation, now, ws_id, ws_id,
            ],
        )?;
    }

    Ok(ws_id)
}
