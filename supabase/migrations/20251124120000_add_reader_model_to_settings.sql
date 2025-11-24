-- Add selected_reader_model column to user_settings table
-- Used for e-reader article processing

-- Add column if it doesn't exist
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS selected_reader_model TEXT
    REFERENCES models(model_identifier) ON DELETE RESTRICT;

-- Set default for any NULL values in existing rows
UPDATE user_settings
SET selected_reader_model = 'claude-haiku-4-5'
WHERE selected_reader_model IS NULL;

-- Make column NOT NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings'
    AND column_name = 'selected_reader_model'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE user_settings ALTER COLUMN selected_reader_model SET NOT NULL;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN user_settings.selected_reader_model IS 'Model used for e-reader article processing and summarization';
