/// Note CRUD and organization commands.
pub mod notes;
/// Plan CRUD, calendar queries, spawning, and agenda commands.
pub mod plans;
/// Reference (cross-entity link) commands.
pub mod references;
/// Full-text search commands.
pub mod search;
/// Markdown export commands.
pub mod export;
/// Settings management commands.
pub mod settings;
/// Task CRUD, filtering, bulk operations, and kanban commands.
pub mod tasks;
/// Time entry CRUD, tracker state machine, reports, and recovery commands.
pub mod time_entries;
/// Workspace CRUD, config, dashboard, and cross-workspace reference commands.
pub mod workspaces;
