-- Add Felix evaluation columns to gmail_processed table
-- Stores Felix's assessment of each email

ALTER TABLE gmail_processed
ADD COLUMN IF NOT EXISTS felix_evaluation TEXT,
ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN DEFAULT FALSE;

-- Index for finding emails that need attention
CREATE INDEX IF NOT EXISTS idx_gmail_processed_attention
ON gmail_processed(needs_attention)
WHERE needs_attention = TRUE;
