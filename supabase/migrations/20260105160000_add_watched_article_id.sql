-- Add watched_article_id to user_settings for persisting the live-linked file watch state
ALTER TABLE user_settings
ADD COLUMN watched_article_id uuid REFERENCES articles(id) ON DELETE SET NULL;

-- Add index for foreign key lookups
CREATE INDEX idx_user_settings_watched_article ON user_settings(watched_article_id);
