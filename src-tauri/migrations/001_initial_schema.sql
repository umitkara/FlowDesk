-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT,
    color TEXT,
    export_path TEXT,
    sort_order INTEGER DEFAULT 0,
    config JSON,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL
);

-- Notes
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    title TEXT,
    date TEXT,
    body TEXT NOT NULL DEFAULT '',
    folder TEXT,
    category TEXT,
    type TEXT,
    color TEXT,
    importance TEXT,
    front_matter JSON,
    body_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- Indexes for notes
CREATE INDEX IF NOT EXISTS idx_notes_workspace ON notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(workspace_id, folder);
CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(workspace_id, date);
CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(workspace_id, category);
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(workspace_id, type);
CREATE INDEX IF NOT EXISTS idx_notes_importance ON notes(workspace_id, importance);
CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
