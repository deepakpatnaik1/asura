-- Add processed_at to track which raw_intel records have been synthesized
ALTER TABLE raw_intel ADD COLUMN IF NOT EXISTS processed_at timestamptz;
