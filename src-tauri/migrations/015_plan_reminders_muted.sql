-- ============================================================
-- Migration 015: Add reminders_muted flag to plans
-- ============================================================

ALTER TABLE plans ADD COLUMN reminders_muted INTEGER NOT NULL DEFAULT 0;
