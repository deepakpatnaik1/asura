-- Remove turn_number from superjournal
-- The reorder trigger caused bulk deletes to fail (nuke feature broken)
-- Turn numbers were cosmetic - created_at provides ordering

-- Drop triggers and functions
DROP TRIGGER IF EXISTS trg_superjournal_reorder_turn_numbers ON superjournal;
DROP TRIGGER IF EXISTS trg_superjournal_assign_turn_number ON superjournal;
DROP FUNCTION IF EXISTS superjournal_reorder_turn_numbers();
DROP FUNCTION IF EXISTS superjournal_assign_turn_number();

-- Drop constraint and index
ALTER TABLE superjournal DROP CONSTRAINT IF EXISTS superjournal_user_turn_unique;
DROP INDEX IF EXISTS idx_superjournal_user_turn;

-- Drop column
ALTER TABLE superjournal DROP COLUMN IF EXISTS turn_number;
