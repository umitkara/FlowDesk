-- Note version history table
CREATE TABLE IF NOT EXISTS note_versions (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    title TEXT,
    body TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_note_versions_note_id ON note_versions(note_id);
CREATE INDEX IF NOT EXISTS idx_note_versions_workspace_id ON note_versions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_note_versions_created_at ON note_versions(created_at);
