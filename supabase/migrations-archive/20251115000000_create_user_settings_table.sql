-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selected_model TEXT NOT NULL REFERENCES models(model_identifier) ON DELETE RESTRICT,
  selected_persona TEXT NOT NULL DEFAULT 'gunnar' CHECK (selected_persona IN ('gunnar', 'kirby')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Single-row constraint (ensures only one settings row exists globally)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_singleton ON user_settings ((1));

-- Insert default row (only if table is empty and has the old schema)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'selected_model') THEN
        INSERT INTO user_settings (selected_model, selected_persona)
        SELECT 'accounts/fireworks/models/qwen3-235b-a22b', 'gunnar'
        WHERE NOT EXISTS (SELECT 1 FROM user_settings);
    END IF;
END $$;

-- Add comments for documentation (skip if columns don't exist in new schema)
COMMENT ON TABLE user_settings IS 'Global application settings (single-row, no user_id - single-user app)';
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'selected_model') THEN
        COMMENT ON COLUMN user_settings.selected_model IS 'Current model for chat and file compression';
    END IF;
END $$;
COMMENT ON COLUMN user_settings.selected_persona IS 'Current persona (gunnar or kirby)';
