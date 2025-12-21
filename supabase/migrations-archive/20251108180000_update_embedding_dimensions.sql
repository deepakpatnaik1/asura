-- Update embedding column to 1536 dimensions to match voyage-3-large model
-- Drop existing index first
DROP INDEX IF EXISTS idx_journal_embedding;

-- Alter column type
ALTER TABLE journal
  ALTER COLUMN embedding TYPE vector(1536);

-- Recreate HNSW index
CREATE INDEX idx_journal_embedding ON journal
  USING hnsw (embedding vector_cosine_ops);

-- Update comment
COMMENT ON COLUMN journal.embedding IS '1536-dimensional vector from Voyage AI (voyage-3-large model) for semantic search';
