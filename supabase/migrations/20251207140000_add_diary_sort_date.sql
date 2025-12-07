-- Add sort_date column for chronological ordering of fuzzy event periods
-- The LLM computes this from event_period (e.g., "2019" → "2019-07-01", "Summer 2023" → "2023-07-15")
-- Falls back to logged_at if not provided

ALTER TABLE founder_diary ADD COLUMN IF NOT EXISTS sort_date DATE;

-- Default existing entries: use logged_at date for entries without sort_date
UPDATE founder_diary SET sort_date = DATE(logged_at) WHERE sort_date IS NULL;

-- Create index for sorting
CREATE INDEX IF NOT EXISTS founder_diary_user_sort ON founder_diary(user_id, sort_date DESC);
