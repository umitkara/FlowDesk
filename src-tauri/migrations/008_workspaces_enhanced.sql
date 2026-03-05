-- Phase 5: Enhanced workspace support
-- Adds deleted_at for soft deletes, attachment_path, and config defaults.
-- The config column and sort_order already exist from migration 001.

-- Add soft delete support
ALTER TABLE workspaces ADD COLUMN deleted_at TEXT;

-- Add attachment directory path
ALTER TABLE workspaces ADD COLUMN attachment_path TEXT;

-- Create index for sort order (used in workspace switcher)
CREATE INDEX IF NOT EXISTS idx_workspaces_sort_order ON workspaces(sort_order);

-- Create index for slug lookup
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);

-- Create index for soft delete filtering
CREATE INDEX IF NOT EXISTS idx_workspaces_deleted_at ON workspaces(deleted_at);

-- Populate config with full defaults for existing workspaces that have partial config
UPDATE workspaces SET config = json_set(
    COALESCE(config, '{}'),
    '$.task_categories', json('["bug","feature","chore"]'),
    '$.accent_color', '#3b82f6',
    '$.dashboard_widgets', json('["today_plan","pending_tasks","recent_notes","time_today"]')
) WHERE config IS NULL
   OR json_extract(config, '$.accent_color') IS NULL;

-- Ensure workspace-scoped indexes on all entity tables
CREATE INDEX IF NOT EXISTS idx_notes_workspace_id ON notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_plans_workspace_id ON plans(workspace_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_workspace_id ON time_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tags_workspace_id ON tags(workspace_id);

-- Composite indexes for common workspace-scoped queries
CREATE INDEX IF NOT EXISTS idx_notes_workspace_folder ON notes(workspace_id, folder) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_workspace_date ON notes(workspace_id, date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status ON tasks(workspace_id, status) WHERE deleted_at IS NULL;
