-- Add file_artisan_model column to user_settings
-- Allows users to configure which model to use for file artisan cut (persistent content processing)
-- Supports multi-provider architecture: Anthropic or Fireworks models can be selected

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS file_artisan_model TEXT;

-- No default - if NULL, uses user's default_model (existing behavior)
