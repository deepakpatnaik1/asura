-- Add scroll_bookmark column to user_settings for persisting navigation bookmarks
-- Stores: { message_id, header_text, header_level, header_index }

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS scroll_bookmark JSONB DEFAULT NULL;

COMMENT ON COLUMN user_settings.scroll_bookmark IS 'Persisted scroll bookmark for navigation within long message turns. JSON: { message_id, header_text, header_level, header_index }';
