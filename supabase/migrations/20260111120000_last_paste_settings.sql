-- Add columns to remember last paste box selections
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS last_content_owner TEXT DEFAULT 'system';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS last_content_lifecycle TEXT DEFAULT 'ephemeral';

COMMENT ON COLUMN user_settings.last_content_owner IS 'Last selected owner in paste box (persists across sessions)';
COMMENT ON COLUMN user_settings.last_content_lifecycle IS 'Last selected lifecycle in paste box (persists across sessions)';
