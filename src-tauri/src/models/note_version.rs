use serde::{Deserialize, Serialize};

/// A snapshot of a note's content at a point in time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteVersion {
    pub id: String,
    pub note_id: String,
    pub workspace_id: String,
    pub title: Option<String>,
    pub body: String,
    pub body_hash: String,
    pub version_number: i32,
    pub created_at: String,
}

/// Lightweight version info for timeline display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteVersionSummary {
    pub id: String,
    pub version_number: i32,
    pub title: Option<String>,
    pub body_hash: String,
    pub created_at: String,
    pub body_size: usize,
}

/// A computed diff between two versions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionDiff {
    pub from_version_id: String,
    pub to_version_id: String,
    pub hunks: Vec<DiffHunk>,
    pub stats: DiffStats,
}

/// Statistics for a diff.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffStats {
    pub additions: usize,
    pub deletions: usize,
    pub unchanged: usize,
}

/// A contiguous region of changes in a diff.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    pub lines: Vec<DiffLine>,
}

/// A single line in a diff.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub content: String,
}

/// The kind of a diff line.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DiffLineKind {
    Added,
    Removed,
    Unchanged,
}

/// Storage stats for version history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionStorageStats {
    pub total_versions: usize,
    pub total_size_bytes: usize,
    pub notes_with_versions: usize,
    pub largest_notes: Vec<NoteVersionSizeEntry>,
}

/// Per-note version size info.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteVersionSizeEntry {
    pub note_id: String,
    pub title: Option<String>,
    pub version_count: usize,
    pub total_size_bytes: usize,
}

/// Result of a prune operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PruneResult {
    pub pruned_count: usize,
    pub freed_bytes: usize,
}

/// Configuration for version history behavior.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionHistoryConfig {
    pub enabled: bool,
    pub max_versions_per_note: usize,
    pub auto_prune: bool,
    pub snapshot_debounce_secs: u64,
}

impl Default for VersionHistoryConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_versions_per_note: 50,
            auto_prune: true,
            snapshot_debounce_secs: 5,
        }
    }
}
