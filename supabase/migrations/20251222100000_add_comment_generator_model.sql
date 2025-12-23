-- Add model_comment_generator column to user_settings
-- Used by Ananya's community-manager role for writing Reddit/Discord comments (Opus 4.5)

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS model_comment_generator text DEFAULT 'claude-opus-4-5-20251101';

COMMENT ON COLUMN user_settings.model_comment_generator IS 'Model for Reddit/Discord comment generation (Ananya pipeline)';
