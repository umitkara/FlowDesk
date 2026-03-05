-- Phase 6: Advanced Views & Discovery
-- Adds saved_filters and activity_log tables

-- Saved filters / smart searches
CREATE TABLE IF NOT EXISTS saved_filters (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    filter_config JSON NOT NULL,
    sort_order INTEGER DEFAULT 0,
    pinned INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_saved_filters_workspace ON saved_filters(workspace_id);
CREATE INDEX IF NOT EXISTS idx_saved_filters_pinned ON saved_filters(workspace_id, pinned DESC, sort_order);

-- Activity log for timeline view
CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_title TEXT,
    action TEXT NOT NULL,
    details JSON,
    actor TEXT DEFAULT 'user',
    created_at TEXT NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_activity_workspace_time ON activity_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(workspace_id, action);
