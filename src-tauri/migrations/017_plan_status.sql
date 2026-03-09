-- Add status column to plans table for completion tracking
ALTER TABLE plans ADD COLUMN status TEXT NOT NULL DEFAULT 'scheduled';
