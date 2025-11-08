-- Add instructions fields to journal table
-- Note: embedding field and HNSW index already exist in 20251108000002_create_journal.sql

ALTER TABLE journal
  ADD COLUMN is_instruction BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN instruction_scope TEXT;

-- Create index for instruction filtering (partial index for efficiency)
CREATE INDEX journal_instruction_scope_idx
  ON journal (is_instruction, instruction_scope)
  WHERE is_instruction = true;

-- Add comments for documentation
COMMENT ON COLUMN journal.is_instruction IS 'Flags behavioral directives that persist indefinitely in context';
COMMENT ON COLUMN journal.instruction_scope IS 'Scope: global, gunnar, vlad, kirby, stefan, ananya, samara, or NULL';
COMMENT ON COLUMN journal.embedding IS '1536-dimensional vector from Voyage AI Gemini for semantic search';
