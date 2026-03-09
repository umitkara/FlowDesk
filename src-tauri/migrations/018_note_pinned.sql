ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_notes_pinned ON notes(workspace_id, pinned);
