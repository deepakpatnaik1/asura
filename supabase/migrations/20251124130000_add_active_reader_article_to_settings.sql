-- Add active_reader_article_id column to user_settings table
-- Used to persist which article the user is currently viewing in the e-reader

-- Add column if it doesn't exist
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS active_reader_article_id UUID
    REFERENCES articles(id) ON DELETE SET NULL;

-- Add comment for documentation
COMMENT ON COLUMN user_settings.active_reader_article_id IS 'Currently active article in the e-reader (persisted across sessions)';
