-- Add focused_message_id to persist focus mode across browser refreshes
-- This column stores the superjournal message ID that should be in focus mode

ALTER TABLE user_settings
ADD COLUMN focused_message_id uuid REFERENCES superjournal(id) ON DELETE SET NULL;

-- Index for quick lookups (though typically only one row per user)
CREATE INDEX idx_user_settings_focused_message ON user_settings(focused_message_id)
WHERE focused_message_id IS NOT NULL;

COMMENT ON COLUMN user_settings.focused_message_id IS 'Currently focused message for immersive reading mode, persists across refreshes';
