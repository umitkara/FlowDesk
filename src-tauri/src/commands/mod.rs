/// Activity log query commands.
pub mod activity;
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
/// Reference (cross-entity link) commands.
pub mod references;
/// Full-text search commands.
pub mod search;
/// Settings management commands.
pub mod settings;
/// Task CRUD, filtering, bulk operations, and kanban commands.
pub mod tasks;
/// Time entry CRUD, tracker state machine, reports, and recovery commands.
pub mod time_entries;
/// Workspace CRUD, config, dashboard, and cross-workspace reference commands.
pub mod workspaces;
