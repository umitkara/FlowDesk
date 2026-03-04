-- Migration 005: References table for cross-entity linking.
-- Table is named 'refs' because REFERENCES is a reserved SQL keyword.

CREATE TABLE IF NOT EXISTS refs (
    id              TEXT PRIMARY KEY NOT NULL,
    source_type     TEXT NOT NULL,
    source_id       TEXT NOT NULL,
    target_type     TEXT NOT NULL,
    target_id       TEXT,
    target_uri      TEXT,
    relation        TEXT NOT NULL DEFAULT 'references',
    created_at      TEXT NOT NULL,

    -- At least one of target_id or target_uri must be set
    CHECK (target_id IS NOT NULL OR target_uri IS NOT NULL)
);

-- Indexes for efficient lookups
CREATE INDEX idx_refs_source         ON refs(source_type, source_id);
CREATE INDEX idx_refs_target         ON refs(target_type, target_id);
CREATE INDEX idx_refs_relation       ON refs(relation);
CREATE UNIQUE INDEX idx_refs_unique  ON refs(source_type, source_id, target_type, target_id, relation)
    WHERE target_id IS NOT NULL;
CREATE UNIQUE INDEX idx_refs_unique_uri ON refs(source_type, source_id, target_type, target_uri, relation)
    WHERE target_uri IS NOT NULL;
