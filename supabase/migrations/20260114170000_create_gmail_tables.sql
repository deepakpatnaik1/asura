-- Gmail Integration Tables
-- Supports multiple Gmail accounts per user (personal + company)

-- Gmail account connections
CREATE TABLE gmail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('personal', 'company')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  watch_expiration TIMESTAMPTZ, -- When Gmail push notification expires (7 days max)
  watch_history_id TEXT, -- Gmail history ID for incremental sync
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, email)
);

-- Watched sender patterns
CREATE TABLE gmail_watch_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  sender_pattern TEXT NOT NULL, -- Email address or domain pattern (e.g., 'tk.de', 'helvetia.de')
  sender_name TEXT, -- Human-friendly name (e.g., 'TK Health Insurance')
  auto_create_todo BOOLEAN DEFAULT true,
  apply_label TEXT, -- Optional Gmail label to apply
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(gmail_account_id, sender_pattern)
);

-- Processed emails (deduplication + tracking)
CREATE TABLE gmail_processed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL, -- Gmail message ID
  thread_id TEXT,
  from_address TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  snippet TEXT, -- Email preview
  received_at TIMESTAMPTZ NOT NULL,
  todo_id UUID REFERENCES canvas_planner_todos(id) ON DELETE SET NULL,
  attachments JSONB DEFAULT '[]', -- [{filename, storage_path, mime_type, size}]
  processed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(gmail_account_id, message_id)
);

-- Indexes
CREATE INDEX gmail_accounts_user_id ON gmail_accounts(user_id);
CREATE INDEX gmail_watch_rules_account_id ON gmail_watch_rules(gmail_account_id);
CREATE INDEX gmail_processed_account_id ON gmail_processed(gmail_account_id);
CREATE INDEX gmail_processed_received_at ON gmail_processed(received_at DESC);
CREATE INDEX gmail_processed_from_address ON gmail_processed(from_address);

-- RLS Policies (disabled for localhost, but ready for production)
ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_watch_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_processed ENABLE ROW LEVEL SECURITY;

-- gmail_accounts: users can only access their own
CREATE POLICY "Users can view own gmail accounts"
  ON gmail_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own gmail accounts"
  ON gmail_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own gmail accounts"
  ON gmail_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own gmail accounts"
  ON gmail_accounts FOR DELETE USING (auth.uid() = user_id);

-- gmail_watch_rules: access through gmail_accounts ownership
CREATE POLICY "Users can view own watch rules"
  ON gmail_watch_rules FOR SELECT
  USING (gmail_account_id IN (SELECT id FROM gmail_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own watch rules"
  ON gmail_watch_rules FOR INSERT
  WITH CHECK (gmail_account_id IN (SELECT id FROM gmail_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own watch rules"
  ON gmail_watch_rules FOR UPDATE
  USING (gmail_account_id IN (SELECT id FROM gmail_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own watch rules"
  ON gmail_watch_rules FOR DELETE
  USING (gmail_account_id IN (SELECT id FROM gmail_accounts WHERE user_id = auth.uid()));

-- gmail_processed: access through gmail_accounts ownership
CREATE POLICY "Users can view own processed emails"
  ON gmail_processed FOR SELECT
  USING (gmail_account_id IN (SELECT id FROM gmail_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own processed emails"
  ON gmail_processed FOR INSERT
  WITH CHECK (gmail_account_id IN (SELECT id FROM gmail_accounts WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own processed emails"
  ON gmail_processed FOR DELETE
  USING (gmail_account_id IN (SELECT id FROM gmail_accounts WHERE user_id = auth.uid()));
