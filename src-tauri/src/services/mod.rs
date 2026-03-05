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
/// Reference management: inline parsing, diffing, and cycle detection.
pub mod references;
/// Time tracker state machine, elapsed time, session notes, and reports.
pub mod tracker;
