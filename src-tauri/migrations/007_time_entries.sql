-- Time entries table
CREATE TABLE IF NOT EXISTS time_entries (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    start_time      TEXT NOT NULL,           -- ISO 8601, UTC
    end_time        TEXT,                    -- NULL while session is running
    pauses          TEXT DEFAULT '[]',       -- JSON array of {paused_at, resumed_at}
    active_mins     INTEGER,                 -- computed on stop; NULL while running
    notes           TEXT DEFAULT '',         -- markdown session notes
    category        TEXT,
    tags            TEXT DEFAULT '[]',       -- JSON array of strings
    session_notes   TEXT DEFAULT '[]',       -- JSON array of SessionNote objects
    linked_plan_id  TEXT,
    linked_task_id  TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT,

    FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    FOREIGN KEY (linked_plan_id) REFERENCES plans(id),
    FOREIGN KEY (linked_task_id) REFERENCES tasks(id)
);

-- Index for querying by workspace and date range
CREATE INDEX IF NOT EXISTS idx_time_entries_workspace
    ON time_entries(workspace_id, start_time);

-- Index for querying by linked entities
CREATE INDEX IF NOT EXISTS idx_time_entries_linked_plan
    ON time_entries(linked_plan_id)
    WHERE linked_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_linked_task
    ON time_entries(linked_task_id)
    WHERE linked_task_id IS NOT NULL;

-- Index for category/tag reporting
CREATE INDEX IF NOT EXISTS idx_time_entries_category
    ON time_entries(workspace_id, category)
    WHERE deleted_at IS NULL;

-- Tracker state persistence (single-row table for crash recovery)
CREATE TABLE IF NOT EXISTS tracker_state (
    id              INTEGER PRIMARY KEY CHECK (id = 1),  -- enforce single row
    workspace_id    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'idle',         -- idle, running, paused
    time_entry_id   TEXT,                                -- current session's time_entry ID
    started_at      TEXT,                                -- ISO 8601
    paused_at       TEXT,                                -- ISO 8601, set when paused
    pauses          TEXT DEFAULT '[]',                   -- JSON, accumulated pauses
    notes           TEXT DEFAULT '',
    session_notes   TEXT DEFAULT '[]',
    linked_plan_id  TEXT,
    linked_task_id  TEXT,
    category        TEXT,
    tags            TEXT DEFAULT '[]',
    break_mode      TEXT DEFAULT 'none',                 -- none, pomodoro, custom
    break_config    TEXT DEFAULT '{}',                   -- JSON break configuration
    pomodoro_cycle  INTEGER DEFAULT 0,                   -- current cycle count
    updated_at      TEXT NOT NULL
);

-- Insert default idle state
INSERT OR IGNORE INTO tracker_state (id, workspace_id, status, updated_at)
VALUES (1, '', 'idle', datetime('now'));
