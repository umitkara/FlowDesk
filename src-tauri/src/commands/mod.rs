/// Activity log query commands.
pub mod activity;
/// Global hotkey management.
pub mod hotkey;
/// Import commands for markdown, Obsidian, and CSV.
pub mod import;
/// Undo/redo operation commands.
pub mod undo;
/// Note version history commands.
pub mod versions;
/// Graph data, grouped views, faceted search, planned vs actual, and backlinks with context.
pub mod discovery;
/// Markdown export commands.
pub mod export;
/// Saved filter CRUD commands.
pub mod filters;
/// Note CRUD and organization commands.
pub mod notes;
/// Plan CRUD, calendar queries, spawning, and agenda commands.
pub mod plans;
/// Recurrence rule CRUD, occurrence generation, skip/postpone/detach commands.
pub mod recurrence;
/// Reference (cross-entity link) commands.
pub mod references;
/// Reminder CRUD, defaults, dismiss, and scheduling commands.
pub mod reminders;
/// Full-text search commands.
pub mod search;
/// Settings management commands.
pub mod settings;
/// Task CRUD, filtering, bulk operations, and kanban commands.
pub mod tasks;
/// Template CRUD, apply, suggestion, and auto-daily-note commands.
pub mod templates;
/// Time entry CRUD, tracker state machine, reports, and recovery commands.
pub mod time_entries;
/// Workspace CRUD, config, dashboard, and cross-workspace reference commands.
pub mod workspaces;
