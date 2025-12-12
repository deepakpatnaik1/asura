-- Remove is_active column from models table
-- Models are now permanently deleted instead of soft-deleted

ALTER TABLE models DROP COLUMN IF EXISTS is_active;
