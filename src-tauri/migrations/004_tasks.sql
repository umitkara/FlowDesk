-- Migration 004: Tasks table, indexes, FTS5 virtual table, and sync triggers.

CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY NOT NULL,
    workspace_id    TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'inbox',
    priority        TEXT NOT NULL DEFAULT 'none',
    due_date        TEXT,
    scheduled_date  TEXT,
    completed_at    TEXT,
    category        TEXT,
    color           TEXT,
    tags            JSON DEFAULT '[]',
    estimated_mins  INTEGER,
    actual_mins     INTEGER NOT NULL DEFAULT 0,
    recurrence      JSON,
    parent_task_id  TEXT,
    is_sticky       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT,

    FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
);

-- Indexes for common query patterns
CREATE INDEX idx_tasks_workspace     ON tasks(workspace_id);
CREATE INDEX idx_tasks_status        ON tasks(status);
CREATE INDEX idx_tasks_priority      ON tasks(priority);
CREATE INDEX idx_tasks_due_date      ON tasks(due_date);
CREATE INDEX idx_tasks_scheduled     ON tasks(scheduled_date);
CREATE INDEX idx_tasks_parent        ON tasks(parent_task_id);
CREATE INDEX idx_tasks_sticky        ON tasks(is_sticky) WHERE is_sticky = 1;
CREATE INDEX idx_tasks_deleted       ON tasks(deleted_at);
CREATE INDEX idx_tasks_category      ON tasks(category);
CREATE INDEX idx_tasks_completed     ON tasks(completed_at);

-- Full-text search virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
    title,
    description,
    tags,
    category,
    content='tasks',
    content_rowid='rowid'
);

-- FTS sync triggers
CREATE TRIGGER tasks_ai AFTER INSERT ON tasks BEGIN
    INSERT INTO tasks_fts(rowid, title, description, tags, category)
    VALUES (NEW.rowid, NEW.title, NEW.description, NEW.tags, NEW.category);
END;

CREATE TRIGGER tasks_ad AFTER DELETE ON tasks BEGIN
    INSERT INTO tasks_fts(tasks_fts, rowid, title, description, tags, category)
    VALUES ('delete', OLD.rowid, OLD.title, OLD.description, OLD.tags, OLD.category);
END;

CREATE TRIGGER tasks_au AFTER UPDATE ON tasks BEGIN
    INSERT INTO tasks_fts(tasks_fts, rowid, title, description, tags, category)
    VALUES ('delete', OLD.rowid, OLD.title, OLD.description, OLD.tags, OLD.category);
    INSERT INTO tasks_fts(rowid, title, description, tags, category)
    VALUES (NEW.rowid, NEW.title, NEW.description, NEW.tags, NEW.category);
END;
