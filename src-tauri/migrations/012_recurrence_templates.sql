-- ============================================================
-- Migration 012: Recurrence rules, reminders, template settings
-- Phase 7: Recurrence, Templates & Automation
-- ============================================================

-- Recurrence rules table (shared by tasks and plans)
CREATE TABLE recurrence_rules (
    id                TEXT PRIMARY KEY,
    workspace_id      TEXT NOT NULL,
    entity_type       TEXT NOT NULL,            -- 'task' or 'plan'
    parent_entity_id  TEXT NOT NULL,            -- ID of the original (first) task/plan
    pattern           TEXT NOT NULL,            -- 'daily', 'weekly', 'monthly', 'yearly', 'custom'
    interval          INTEGER NOT NULL DEFAULT 1, -- every N periods
    days_of_week      JSON,                    -- for weekly: [0=Sun, 1=Mon, ..., 6=Sat]
    day_of_month      INTEGER,                 -- for monthly: 1-31 (if null, uses original date's day)
    month_of_year     INTEGER,                 -- for yearly: 1-12 (if null, uses original date's month)
    end_date          TEXT,                    -- ISO 8601, nullable (no end = infinite)
    end_after_count   INTEGER,                -- nullable (null = infinite)
    occurrences_created INTEGER NOT NULL DEFAULT 0,
    next_occurrence_date TEXT,                 -- pre-computed next date for scheduling
    is_active         INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
);

CREATE INDEX idx_recurrence_rules_entity
    ON recurrence_rules(entity_type, parent_entity_id);
CREATE INDEX idx_recurrence_rules_next
    ON recurrence_rules(next_occurrence_date)
    WHERE is_active = 1;
CREATE INDEX idx_recurrence_rules_workspace
    ON recurrence_rules(workspace_id);

-- Add recurrence foreign key columns to tasks
ALTER TABLE tasks ADD COLUMN recurrence_rule_id TEXT
    REFERENCES recurrence_rules(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN occurrence_index INTEGER;

-- Add recurrence foreign key columns to plans
ALTER TABLE plans ADD COLUMN recurrence_rule_id TEXT
    REFERENCES recurrence_rules(id) ON DELETE SET NULL;
ALTER TABLE plans ADD COLUMN occurrence_index INTEGER;

CREATE INDEX idx_tasks_recurrence ON tasks(recurrence_rule_id)
    WHERE recurrence_rule_id IS NOT NULL;
CREATE INDEX idx_plans_recurrence ON plans(recurrence_rule_id)
    WHERE recurrence_rule_id IS NOT NULL;

-- Reminders table
CREATE TABLE reminders (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL,
    entity_type   TEXT NOT NULL,              -- 'task' or 'plan'
    entity_id     TEXT NOT NULL,
    remind_at     TEXT NOT NULL,              -- ISO 8601 datetime
    offset_type   TEXT NOT NULL,              -- 'at_time', '15min_before', '1hr_before', '1day_before', 'custom'
    offset_mins   INTEGER,                   -- custom offset in minutes
    is_fired      INTEGER NOT NULL DEFAULT 0,
    is_dismissed  INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE INDEX idx_reminders_pending
    ON reminders(remind_at)
    WHERE is_fired = 0 AND is_dismissed = 0;
CREATE INDEX idx_reminders_entity
    ON reminders(entity_type, entity_id);

-- Default reminder settings
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
    ('reminder_defaults', '{"task_due":["1hr_before"],"plan_start":["15min_before"],"enabled":true}',
     datetime('now'));

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
    ('auto_daily_note', '{"enabled":false,"template":"daily-note"}',
     datetime('now'));
