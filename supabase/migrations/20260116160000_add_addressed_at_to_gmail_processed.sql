-- Add addressed_at column to gmail_processed
-- Tracks when Boss and Felix discussed each email alert

ALTER TABLE gmail_processed
ADD COLUMN IF NOT EXISTS addressed_at TIMESTAMPTZ;

-- Index for efficient querying of pending alerts
CREATE INDEX IF NOT EXISTS idx_gmail_processed_pending_alerts
ON gmail_processed (gmail_account_id, needs_attention, addressed_at)
WHERE needs_attention = true AND addressed_at IS NULL;

COMMENT ON COLUMN gmail_processed.addressed_at IS 'When Boss and Felix discussed this email alert';
