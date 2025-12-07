-- Add parent_id for nested todos
-- Allows breaking down complex todos into sub-tasks

ALTER TABLE todos ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES todos(id) ON DELETE CASCADE;

-- Index for efficient child lookup
CREATE INDEX IF NOT EXISTS todos_parent_id ON todos(parent_id) WHERE parent_id IS NOT NULL;
