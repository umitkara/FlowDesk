/// Activity logging on entity mutations.
pub mod activity;
/// Automated database backup service.
pub mod backup;
/// Markdown export service.
pub mod export;
/// Multi-entity faceted search with filters and facet computation.
pub mod faceted_search;
/// YAML front matter parsing and reconstruction.
pub mod frontmatter;
/// Graph data computation from the references table.
pub mod graph;
/// Recurrence date computation and occurrence generation.
pub mod recurrence;
/// Reference management: inline parsing, diffing, and cycle detection.
pub mod references;
/// Reminder scheduling, computation, and notification support.
pub mod reminders;
/// Auto-suggestion engine for time tracker stop events.
pub mod suggestions;
/// File-based note template management and variable substitution.
pub mod templates;
/// Time tracker state machine, elapsed time, session notes, and reports.
pub mod tracker;
