-- Full-text search for notes
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title,
    body,
    category,
    type,
    content='notes',
    content_rowid='rowid'
);

-- FTS sync triggers
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, body, category, type)
    VALUES (new.rowid, new.title, new.body, new.category, new.type);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, body, category, type)
    VALUES ('delete', old.rowid, old.title, old.body, old.category, old.type);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, body, category, type)
    VALUES ('delete', old.rowid, old.title, old.body, old.category, old.type);
    INSERT INTO notes_fts(rowid, title, body, category, type)
    VALUES (new.rowid, new.title, new.body, new.category, new.type);
END;
