-- Stage Manager state persistence
-- Tracks when Felix's notification was dismissed and when Boss last talked to Felix

CREATE TABLE IF NOT EXISTS stage_manager_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    flash_dismissed_at TIMESTAMPTZ,
    last_talked_to_felix_at TIMESTAMPTZ,
    pending_email_check BOOLEAN DEFAULT FALSE,  -- Set by 9am cron, cleared after check
    last_email_check_at TIMESTAMPTZ,            -- When we last scanned starred emails
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_stage_manager_user ON stage_manager_state(user_id);

-- Insert default row for single-user setup
INSERT INTO stage_manager_state (user_id)
VALUES ('00000000-0000-0000-0000-000000000000')
ON CONFLICT (user_id) DO NOTHING;
