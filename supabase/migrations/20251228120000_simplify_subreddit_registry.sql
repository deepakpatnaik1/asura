-- Simplify subreddit_registry: add engagement_score, drop unused columns
-- Rotation now based on score (lowest = next to engage), not timestamps

-- Add engagement_score column
ALTER TABLE subreddit_registry
ADD COLUMN engagement_score integer NOT NULL DEFAULT 0;

-- Drop unused columns
ALTER TABLE subreddit_registry
DROP COLUMN last_engaged,
DROP COLUMN notes,
DROP COLUMN created_at;
