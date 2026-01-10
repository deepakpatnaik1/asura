-- Add default_content_owner to user_settings for PasteArea persistence
-- When user uploads content with a specific owner, remember it for next upload

ALTER TABLE user_settings
ADD COLUMN default_content_owner TEXT DEFAULT 'system';

COMMENT ON COLUMN user_settings.default_content_owner IS 'Persisted owner selection for PasteArea dropdown (system, felix, gunnar, etc.)';
