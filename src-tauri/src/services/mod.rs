/// Automated database backup service.
pub mod backup;
/// Markdown export service.
pub mod export;
/// YAML front matter parsing and reconstruction.
pub mod frontmatter;
/// Reference management: inline parsing, diffing, and cycle detection.
pub mod references;
/// Time tracker state machine, elapsed time, session notes, and reports.
pub mod tracker;
