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

    // ISO datetime helpers (UTC midnight + offset for specific hours)
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
    // 1. WORKSPACE
    // =====================================================================
    let ws_id = generate_id();
    let config_json = r##"{"categories":["work","personal","learning"],"note_types":["journal","meeting","technical","reference","draft"],"task_categories":["feature","bug","research","chore"],"dashboard_widgets":["today_plan","pending_tasks","recent_notes","time_today","sticky_tasks","upcoming_deadlines"],"accent_color":"#8b5cf6"}"##;

    conn.execute(
        "INSERT INTO workspaces (id, name, slug, icon, color, sort_order, config, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            ws_id,
            "FlowDesk Demo",
            "flowdesk-demo",
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
        // Re-read the actual id in case INSERT OR IGNORE skipped (name already exists)
        let actual_id: String = conn.query_row(
            "SELECT id FROM tags WHERE workspace_id = ?1 AND name = ?2",
            rusqlite::params![ws_id, name],
            |row| row.get(0),
        )?;
        tag_ids.insert(name, actual_id);
    }

    // =====================================================================
    // 3. NOTES
    // =====================================================================

    // Helper: insert a note and return its id
    // Columns: id, workspace_id, title, date, body, folder, category, type,
    //          color, importance, front_matter, body_hash, created_at, updated_at,
    //          deleted_at, pinned
    macro_rules! note {
        ($id:expr, $title:expr, $date:expr, $body:expr, $folder:expr,
         $ntype:expr, $importance:expr, $pinned:expr) => {{
            conn.execute(
                "INSERT INTO notes (id, workspace_id, title, date, body, folder, type,
                                    importance, created_at, updated_at, pinned)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                rusqlite::params![
                    $id, ws_id, $title, $date, $body, $folder, $ntype,
                    $importance, now, now, $pinned as i64
                ],
            )?;
        }};
    }

    let n1 = generate_id(); // Getting Started with FlowDesk
    let n2 = generate_id(); // Weekly Team Standup
    let n3 = generate_id(); // Project Alpha: Architecture Notes
    let n4 = generate_id(); // Daily Journal
    let n5 = generate_id(); // Research: PKM
    let n6 = generate_id(); // Q2 Planning Notes
    let n7 = generate_id(); // UI Component Sketches
    let n8 = generate_id(); // Reading List

    note!(
        n1,
        "Getting Started with FlowDesk",
        &today_str as &str,
        "Welcome to FlowDesk! This workspace is pre-populated with demo content so you can explore every feature.\n\nUse the sidebar to navigate between Notes, Tasks, Plans, and the Time Tracker. The Command Palette (Ctrl+K) gives you quick access to all actions.\n\nTip: try the Graph view under Discovery to see how entities connect.",
        "/overview",
        "reference",
        "high",
        1i64
    );

    note!(
        n2,
        "Weekly Team Standup - Mar 10",
        &yesterday_str as &str,
        "Attendees: Alice, Bob, Carol, Dave\n\nYesterday:\n- Finished the architecture review\n- Fixed the search performance regression\n\nToday:\n- Continue dark mode implementation\n- Start Q2 planning document\n\nBlockers:\n- Waiting on design assets for the new dashboard widgets",
        "/meetings",
        "meeting",
        Option::<&str>::None,
        0i64
    );

    note!(
        n3,
        "Project Alpha: Architecture Notes",
        &today_str as &str,
        "## Overview\n\nProject Alpha uses a layered architecture with a Tauri shell, a Rust backend, and a React frontend.\n\n## Key Decisions\n\n- SQLite for local persistence (bundled via rusqlite)\n- Zustand for frontend state management\n- Tiptap for rich-text editing\n\n## Open Questions\n\n- Should we split the notes FTS index into a separate virtual table per workspace?\n- Performance profiling needed for large note collections (>10k notes)",
        "/projects/alpha",
        "technical",
        "high",
        0i64
    );

    note!(
        n4,
        &format!("Daily Journal — {}", today_str) as &str,
        &today_str as &str,
        "Morning reflection:\n\nFocused on getting the demo workspace seed working today. The time entry schema is a bit tricky — need to make sure active_mins is calculated correctly from the pauses array.\n\nGoals for today:\n1. Finish the seed command\n2. Wire up the frontend button\n3. Run clippy and tsc to validate",
        "/daily",
        "journal",
        Option::<&str>::None,
        0i64
    );

    note!(
        n5,
        "Research: Personal Knowledge Management",
        &today_str as &str,
        "## PKM Systems\n\nExploring different approaches to personal knowledge management:\n\n**Zettelkasten** — atomic notes with bidirectional links. Good for building a long-term knowledge base.\n\n**PARA** — Projects, Areas, Resources, Archives. Great for actionable information.\n\n**Building a Second Brain** — focuses on capture, organize, distill, express.\n\n## FlowDesk's Take\n\nFlowDesk combines all three: notes as atomic units, tasks and plans for action, workspaces for PARA-style organisation.",
        Option::<&str>::None,
        "reference",
        Option::<&str>::None,
        0i64
    );

    note!(
        n6,
        "Q2 Planning Notes",
        &today_str as &str,
        "## Q2 Goals\n\n1. Ship the export improvements (CSV + JSON workspace)\n2. Complete dark mode across all views\n3. Launch the public beta\n\n## Key Milestones\n\n- Apr 1: Feature freeze\n- Apr 15: Beta launch\n- May 1: v1.0 release\n\n## Resource Allocation\n\n- 2 engineers on features\n- 1 engineer on infrastructure\n- Design contractor for the landing page",
        Option::<&str>::None,
        "reference",
        "critical",
        1i64
    );

    note!(
        n7,
        "UI Component Sketches",
        &today_str as &str,
        "## Components in Progress\n\n- **CommandPalette** — fuzzy search overlay, Ctrl+K\n- **KanbanBoard** — drag-and-drop task columns\n- **GraphView** — force-directed graph of entity links\n\n## Design Tokens\n\nUsing CSS custom properties for theming:\n- `--workspace-accent`: primary action color\n- `--workspace-accent-light`: hover states\n- `--workspace-accent-dark`: active states\n\n## Open TODOs\n\n- Add animation on drag-start\n- Mobile-friendly breakpoints",
        "/projects/alpha",
        "draft",
        Option::<&str>::None,
        0i64
    );

    note!(
        n8,
        "Reading List",
        &today_str as &str,
        "## Currently Reading\n\n- *How to Take Smart Notes* — Sönke Ahrens\n- *A Philosophy of Software Design* — John Ousterhout\n\n## To Read\n\n- *Thinking in Systems* — Donella Meadows\n- *The Pragmatic Programmer* — Hunt & Thomas\n- *Staff Engineer* — Will Larson\n\n## Recently Finished\n\n- *Shape Up* — Ryan Singer ⭐⭐⭐⭐⭐\n- *The Manager's Path* — Camille Fournier ⭐⭐⭐⭐",
        "/personal",
        "reference",
        Option::<&str>::None,
        0i64
    );

    // Note tags
    let note_tag_map: &[(&str, &[&str])] = &[
        (&n1, &["guide", "overview"]),
        (&n2, &["team", "standup"]),
        (&n3, &["architecture", "backend"]),
        // n4 has no tags
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

    // done tasks
    let t_setup      = generate_id();
    let t_schema     = generate_id();
    let t_editor     = generate_id();
    let t_release    = generate_id();
    // in_progress tasks
    let t_darkmode   = generate_id(); // parent of subtask
    let t_search_fix = generate_id();
    let t_refactor   = generate_id();
    // todo tasks
    let t_shortcuts  = generate_id();
    let t_docs       = generate_id();
    let t_csv        = generate_id();
    let t_profiling  = generate_id();
    // inbox tasks
    let t_prs        = generate_id();
    let t_deps       = generate_id();
    let t_macos      = generate_id();
    // cancelled tasks
    let t_old_auth   = generate_id();
    // subtask
    let t_css_vars   = generate_id();

    // Columns: id, workspace_id, title, description, status, priority, due_date,
    //          scheduled_date, completed_at, category, color, tags, estimated_mins,
    //          actual_mins, recurrence, parent_task_id, is_sticky, created_at, updated_at, deleted_at

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

    // subtask of "Add dark mode support"
    conn.execute(
        "INSERT INTO tasks (id,workspace_id,title,status,priority,tags,parent_task_id,created_at,updated_at,actual_mins)
         VALUES (?1,?2,?3,'todo','medium','[]',?4,?5,?6,0)",
        rusqlite::params![t_css_vars, ws_id, "Update CSS variables", t_darkmode, now, now],
    )?;

    // =====================================================================
    // 5. PLANS
    // =====================================================================

    // Columns: id, workspace_id, title, description, start_time, end_time,
    //          all_day, type, category, color, importance, tags, recurrence,
    //          created_at, updated_at, deleted_at, status

    let p_deep_work   = generate_id();
    let p_standup     = generate_id();
    let p_code_review = generate_id();
    let p_planning    = generate_id();
    let p_q2_kickoff  = generate_id();
    let p_monthly     = generate_id();

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

    // Columns: id, workspace_id, start_time, end_time, pauses, active_mins,
    //          notes, category, tags, session_notes, linked_plan_id,
    //          linked_task_id, created_at, updated_at, deleted_at

    let te1 = generate_id();
    let te2 = generate_id();
    let te3 = generate_id();
    let te4 = generate_id();
    let te5 = generate_id();

    // Yesterday 09:15 - 11:00 (105 min) — development — linked to t_refactor
    conn.execute(
        "INSERT INTO time_entries (id,workspace_id,start_time,end_time,pauses,active_mins,notes,category,tags,session_notes,linked_task_id,created_at,updated_at)
         VALUES (?1,?2,?3,?4,'[]',105,'','development','[]','[]',?5,?6,?7)",
        rusqlite::params![te1, ws_id, yesterday_09_15, yesterday_11_00, t_refactor, now, now],
    )?;

    // Yesterday 14:00 - 14:45 (45 min) — research — no link
    conn.execute(
        "INSERT INTO time_entries (id,workspace_id,start_time,end_time,pauses,active_mins,notes,category,tags,session_notes,created_at,updated_at)
         VALUES (?1,?2,?3,?4,'[]',45,'','research','[]','[]',?5,?6)",
        rusqlite::params![te2, ws_id, yesterday_14_00, yesterday_14_45, now, now],
    )?;

    // Today 09:00 - 10:55 (115 min) — development — linked to p_deep_work
    conn.execute(
        "INSERT INTO time_entries (id,workspace_id,start_time,end_time,pauses,active_mins,notes,category,tags,session_notes,linked_plan_id,created_at,updated_at)
         VALUES (?1,?2,?3,?4,'[]',115,'','development','[]','[]',?5,?6,?7)",
        rusqlite::params![te3, ws_id, today_09_00, today_10_55, p_deep_work, now, now],
    )?;

    // Today 11:00 - 11:28 (28 min) — meetings — linked to p_standup
    conn.execute(
        "INSERT INTO time_entries (id,workspace_id,start_time,end_time,pauses,active_mins,notes,category,tags,session_notes,linked_plan_id,created_at,updated_at)
         VALUES (?1,?2,?3,?4,'[]',28,'','meetings','[]','[]',?5,?6,?7)",
        rusqlite::params![te4, ws_id, today_11_00, today_11_28, p_standup, now, now],
    )?;

    // Today 14:00 - 15:30 (90 min) — code-review — linked to p_code_review
    conn.execute(
        "INSERT INTO time_entries (id,workspace_id,start_time,end_time,pauses,active_mins,notes,category,tags,session_notes,linked_plan_id,created_at,updated_at)
         VALUES (?1,?2,?3,?4,'[]',90,'','code-review','[]','[]',?5,?6,?7)",
        rusqlite::params![te5, ws_id, today_14_00, today_15_30, p_code_review, now, now],
    )?;

    // =====================================================================
    // 7. REFS
    // =====================================================================

    // Columns: id, source_type, source_id, target_type, target_id, target_uri,
    //          relation, created_at, source_workspace_id, target_workspace_id

    let ref_defs: &[(&str, &str, &str, &str, &str)] = &[
        // note n3 → task t_search_fix
        (&n3, "note", &t_search_fix, "task", "references"),
        // note n1 → task t_darkmode
        (&n1, "note", &t_darkmode, "task", "references"),
        // note n6 → plan p_q2_kickoff
        (&n6, "note", &p_q2_kickoff, "plan", "references"),
        // task t_darkmode → task t_css_vars (subtask_of)
        (&t_darkmode, "task", &t_css_vars, "task", "subtask_of"),
    ];

    for (source_id, source_type, target_id, target_type, relation) in ref_defs {
        let ref_id = generate_id();
        conn.execute(
            "INSERT INTO refs (id, source_type, source_id, target_type, target_id, relation,
                               created_at, source_workspace_id, target_workspace_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            rusqlite::params![
                ref_id,
                source_type,
                source_id,
                target_type,
                target_id,
                relation,
                now,
                ws_id,
                ws_id,
            ],
        )?;
    }

    Ok(ws_id)
}
