-- Add composite indexes for common query patterns to ensure O(log n) performance at scale

-- Superjournal: user_id + created_at (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_superjournal_user_created 
ON superjournal(user_id, created_at DESC);

-- Journal: user_id + created_at (for paginated queries)
CREATE INDEX IF NOT EXISTS idx_journal_user_created 
ON journal(user_id, created_at DESC);

-- Journal: user_id + is_starred (for starred queries)
CREATE INDEX IF NOT EXISTS idx_journal_user_starred 
ON journal(user_id, is_starred) WHERE is_starred = true;

-- Journal: user_id + is_instruction (for instruction queries)
CREATE INDEX IF NOT EXISTS idx_journal_user_instruction 
ON journal(user_id, is_instruction) WHERE is_instruction = true;
