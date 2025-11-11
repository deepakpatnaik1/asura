-- Fix embedding dimensions to match voyage-3 model (1024-dim, not 1536-dim)
-- Previous migrations incorrectly used voyage-3-large (1536-dim)
-- Cost optimization: voyage-3 is 3x cheaper than voyage-3-large

-- Drop existing index
DROP INDEX IF EXISTS idx_journal_embedding;

-- Clear existing embeddings (test data only, no production data to preserve)
UPDATE journal SET embedding = NULL WHERE embedding IS NOT NULL;

-- Alter column type from VECTOR(1536) to VECTOR(1024)
ALTER TABLE journal ALTER COLUMN embedding TYPE vector(1024);

-- Recreate HNSW index for vector similarity search
CREATE INDEX idx_journal_embedding ON journal
  USING hnsw (embedding vector_cosine_ops);

-- Update column comment to reflect correct model
COMMENT ON COLUMN journal.embedding IS '1024-dimensional vector from Voyage AI (voyage-3 model) for semantic search. Cost: $0.06/M tokens.';
