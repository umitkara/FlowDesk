-- Phase 5: Cross-workspace reference support
-- Adds denormalized workspace_id columns to refs table for efficient cross-workspace queries.

ALTER TABLE refs ADD COLUMN source_workspace_id TEXT;
ALTER TABLE refs ADD COLUMN target_workspace_id TEXT;

-- Backfill from existing data
UPDATE refs SET
    source_workspace_id = (
        SELECT workspace_id FROM notes WHERE notes.id = refs.source_id
        UNION ALL
        SELECT workspace_id FROM tasks WHERE tasks.id = refs.source_id
        UNION ALL
        SELECT workspace_id FROM plans WHERE plans.id = refs.source_id
        LIMIT 1
    ),
    target_workspace_id = (
        SELECT workspace_id FROM notes WHERE notes.id = refs.target_id
        UNION ALL
        SELECT workspace_id FROM tasks WHERE tasks.id = refs.target_id
        UNION ALL
        SELECT workspace_id FROM plans WHERE plans.id = refs.target_id
        LIMIT 1
    )
WHERE source_workspace_id IS NULL;

-- Index for finding cross-workspace references
CREATE INDEX IF NOT EXISTS idx_refs_cross_workspace
    ON refs(target_workspace_id)
    WHERE source_workspace_id != target_workspace_id;
