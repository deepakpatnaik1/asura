-- Gmail Push Notifications Table
-- Receives Pub/Sub notifications from Gmail API watch
-- Processed by Felix to trigger real-time alerts

CREATE TABLE gmail_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id UUID REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL, -- Email that received the notification
  history_id TEXT NOT NULL, -- Gmail history ID for incremental fetch
  pubsub_message_id TEXT, -- Pub/Sub message ID for deduplication
  raw_payload JSONB, -- Full Pub/Sub message for debugging
  processed_at TIMESTAMPTZ, -- NULL = unprocessed
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for finding unprocessed notifications
CREATE INDEX gmail_notifications_unprocessed ON gmail_notifications(created_at)
  WHERE processed_at IS NULL;

-- Index for deduplication
CREATE UNIQUE INDEX gmail_notifications_pubsub_id ON gmail_notifications(pubsub_message_id)
  WHERE pubsub_message_id IS NOT NULL;

-- RLS
ALTER TABLE gmail_notifications ENABLE ROW LEVEL SECURITY;

-- Service role can insert (from Edge Function webhook)
CREATE POLICY "Service role can insert notifications"
  ON gmail_notifications FOR INSERT
  WITH CHECK (true);

-- Users can view their own notifications (through gmail_accounts)
CREATE POLICY "Users can view own notifications"
  ON gmail_notifications FOR SELECT
  USING (gmail_account_id IN (SELECT id FROM gmail_accounts WHERE user_id = auth.uid()));

-- Users can update their own notifications (mark processed)
CREATE POLICY "Users can update own notifications"
  ON gmail_notifications FOR UPDATE
  USING (gmail_account_id IN (SELECT id FROM gmail_accounts WHERE user_id = auth.uid()));
