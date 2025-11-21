-- Ensure user_settings has conversation and compression model columns
-- Part of Sonnet 4.5 Megafeature: Chunk 3
-- Idempotent: safe to run multiple times

-- Add new columns if they don't exist (will be skipped if already present)
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS selected_conversation_model TEXT
    REFERENCES models(model_identifier) ON DELETE RESTRICT;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS selected_compression_model TEXT
    REFERENCES models(model_identifier) ON DELETE RESTRICT;

-- Set defaults for any NULL values in existing rows
UPDATE user_settings
SET
  selected_conversation_model = 'accounts/fireworks/models/qwen3-235b-a22b'
WHERE selected_conversation_model IS NULL;

UPDATE user_settings
SET
  selected_compression_model = 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507'
WHERE selected_compression_model IS NULL;

-- Make columns NOT NULL (safe because we just ensured no NULLs exist)
DO $$
BEGIN
  -- Only set NOT NULL if column exists and isn't already NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings'
    AND column_name = 'selected_conversation_model'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE user_settings ALTER COLUMN selected_conversation_model SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings'
    AND column_name = 'selected_compression_model'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE user_settings ALTER COLUMN selected_compression_model SET NOT NULL;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN user_settings.selected_conversation_model IS 'Model used for Call 1A, 1B (chat responses)';
COMMENT ON COLUMN user_settings.selected_compression_model IS 'Model used for Call 2A, 2B, 3A, 3B, Modified 2A, 2B (compression and file processing)';
