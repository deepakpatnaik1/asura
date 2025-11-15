-- Create user_settings table
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selected_model TEXT NOT NULL REFERENCES models(model_identifier) ON DELETE RESTRICT,
  selected_persona TEXT NOT NULL DEFAULT 'gunnar' CHECK (selected_persona IN ('gunnar', 'kirby')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Single-row constraint (ensures only one settings row exists globally)
CREATE UNIQUE INDEX idx_user_settings_singleton ON user_settings ((1));

-- Insert default row
INSERT INTO user_settings (selected_model, selected_persona)
VALUES ('accounts/fireworks/models/qwen3-235b-a22b', 'gunnar');

-- Add comments for documentation
COMMENT ON TABLE user_settings IS 'Global application settings (single-row, no user_id - single-user app)';
COMMENT ON COLUMN user_settings.selected_model IS 'Current model for chat and file compression';
COMMENT ON COLUMN user_settings.selected_persona IS 'Current persona (gunnar or kirby)';
