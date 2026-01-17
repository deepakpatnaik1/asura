-- Felix Cron Triggers table (HOSTED Supabase)
-- Edge Function writes here, Aether reads from here

CREATE TABLE IF NOT EXISTS felix_cron_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_type TEXT NOT NULL,           -- 'daily_email_check'
    triggered_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ,             -- When Aether processed this trigger
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Only one unprocessed trigger per type per day
    UNIQUE(trigger_type, (triggered_at::date))
);

-- Index for quick lookup of unprocessed triggers
CREATE INDEX IF NOT EXISTS idx_felix_triggers_unprocessed
ON felix_cron_triggers(trigger_type)
WHERE processed_at IS NULL;
