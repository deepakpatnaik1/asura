-- Felix Watched Senders
-- Learned from starred emails - Felix watches all emails from these senders
--
-- Workflow:
-- 1. Boss stars one email from Helvetia
-- 2. Felix extracts sender address, adds to this table
-- 3. Future scans check ALL emails from watched senders (not just starred)

CREATE TABLE IF NOT EXISTS felix_watched_senders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    email_address TEXT NOT NULL,              -- e.g., 'info@helvetia.ch'
    email_domain TEXT NOT NULL,               -- e.g., 'helvetia.ch' (for domain-wide matching)
    sender_name TEXT,                         -- Display name if available
    learned_from_message_id TEXT NOT NULL,    -- Gmail message ID that taught Felix this sender
    match_mode TEXT DEFAULT 'address',        -- 'address' (exact) or 'domain' (all @helvetia.ch)
    is_active BOOLEAN DEFAULT TRUE,           -- Can be disabled without deleting
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, email_address)
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_felix_watched_senders_user ON felix_watched_senders(user_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_felix_watched_senders_domain ON felix_watched_senders(email_domain) WHERE is_active = TRUE;
