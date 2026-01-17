-- Create felix_cron_triggers table on hosted Supabase
-- This table stores cron trigger flags that Aether polls for

CREATE TABLE IF NOT EXISTS felix_cron_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_type TEXT NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient polling
CREATE INDEX IF NOT EXISTS idx_felix_cron_triggers_unprocessed
ON felix_cron_triggers (trigger_type, triggered_at DESC)
WHERE processed_at IS NULL;

-- Prevent duplicate triggers on the same day
CREATE UNIQUE INDEX IF NOT EXISTS idx_felix_cron_triggers_daily_unique
ON felix_cron_triggers (trigger_type, DATE(triggered_at));

COMMENT ON TABLE felix_cron_triggers IS 'Cron trigger flags for Felix daily email check';
