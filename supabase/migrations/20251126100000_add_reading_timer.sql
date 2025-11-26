-- Add reading_timer_minutes column to user_settings table
-- Configurable reading session duration for auto-scroll timer

-- Add column with default value
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS reading_timer_minutes INTEGER DEFAULT 20;

-- Set default for any existing NULL values
UPDATE user_settings
SET reading_timer_minutes = 20
WHERE reading_timer_minutes IS NULL;

-- Add check constraint for valid range (1-120 minutes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reading_timer_minutes_range'
  ) THEN
    ALTER TABLE user_settings
      ADD CONSTRAINT reading_timer_minutes_range
      CHECK (reading_timer_minutes >= 1 AND reading_timer_minutes <= 120);
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN user_settings.reading_timer_minutes IS 'Reading session duration in minutes for auto-scroll timer (1-120)';
