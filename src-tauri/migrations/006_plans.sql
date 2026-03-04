-- ============================================================
-- Migration 006: Plans & Calendar (Phase 3)
-- ============================================================

-- Plans table
CREATE TABLE IF NOT EXISTS plans (
    id          TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,                        -- Markdown content
    start_time  TEXT NOT NULL,               -- ISO 8601 datetime
    end_time    TEXT NOT NULL,               -- ISO 8601 datetime
    all_day     INTEGER NOT NULL DEFAULT 0,  -- 0 = false, 1 = true
    type        TEXT NOT NULL DEFAULT 'time_block',  -- time_block | event | daily_plan | milestone
    category    TEXT,
    color       TEXT,
    importance  TEXT,                        -- low | medium | high | critical
    tags        JSON DEFAULT '[]',          -- JSON array of strings
    recurrence  JSON,                       -- Recurrence rule (stored now, evaluated in Phase 7)
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,                        -- Soft delete timestamp

    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_plans_workspace
    ON plans(workspace_id);

CREATE INDEX IF NOT EXISTS idx_plans_start_time
    ON plans(start_time);

CREATE INDEX IF NOT EXISTS idx_plans_end_time
    ON plans(end_time);

CREATE INDEX IF NOT EXISTS idx_plans_type
    ON plans(type);

CREATE INDEX IF NOT EXISTS idx_plans_deleted_at
    ON plans(deleted_at);

-- Composite index for date range queries (calendar views)
CREATE INDEX IF NOT EXISTS idx_plans_workspace_date_range
    ON plans(workspace_id, start_time, end_time)
    WHERE deleted_at IS NULL;

-- FTS5 virtual table for full-text search on plans
CREATE VIRTUAL TABLE IF NOT EXISTS plans_fts USING fts5(
    title,
    description,
    tags,
    category,
    content='plans',
    content_rowid='rowid'
);

-- FTS triggers: keep plans_fts in sync with plans table
CREATE TRIGGER IF NOT EXISTS plans_ai AFTER INSERT ON plans BEGIN
    INSERT INTO plans_fts(rowid, title, description, tags, category)
    VALUES (NEW.rowid, NEW.title, NEW.description, NEW.tags, NEW.category);
END;

CREATE TRIGGER IF NOT EXISTS plans_ad AFTER DELETE ON plans BEGIN
    INSERT INTO plans_fts(plans_fts, rowid, title, description, tags, category)
    VALUES ('delete', OLD.rowid, OLD.title, OLD.description, OLD.tags, OLD.category);
END;

CREATE TRIGGER IF NOT EXISTS plans_au AFTER UPDATE ON plans BEGIN
    INSERT INTO plans_fts(plans_fts, rowid, title, description, tags, category)
    VALUES ('delete', OLD.rowid, OLD.title, OLD.description, OLD.tags, OLD.category);
    INSERT INTO plans_fts(rowid, title, description, tags, category)
    VALUES (NEW.rowid, NEW.title, NEW.description, NEW.tags, NEW.category);
END;
