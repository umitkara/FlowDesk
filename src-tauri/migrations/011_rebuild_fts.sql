-- Migration 011: Rebuild FTS indices from existing data.
-- Required for data created before FTS tables/triggers were set up.

INSERT INTO notes_fts(notes_fts) VALUES('rebuild');
INSERT INTO tasks_fts(tasks_fts) VALUES('rebuild');
INSERT INTO plans_fts(plans_fts) VALUES('rebuild');
