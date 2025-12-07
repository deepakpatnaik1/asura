-- Add fuzzy deadline_period to todos
-- Replaces date-based scheduled_for with text-based fuzzy deadlines
-- Examples: "this month", "next week", "Q1 2026", "before summer"

-- Add deadline_period column
ALTER TABLE todos ADD COLUMN IF NOT EXISTS deadline_period TEXT;

-- Create index for deadline queries
CREATE INDEX IF NOT EXISTS todos_user_deadline ON todos(user_id) WHERE deadline_period IS NOT NULL;

-- Note: We keep scheduled_for for backward compatibility but it's deprecated
-- New todos should use deadline_period instead
