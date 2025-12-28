-- Slim engagement_log to deduplication-only purpose
-- Ananya just needs to know where she's engaged, not metrics/analysis

ALTER TABLE engagement_log
    DROP COLUMN IF EXISTS upvotes,
    DROP COLUMN IF EXISTS replies,
    DROP COLUMN IF EXISTS reply_sentiment,
    DROP COLUMN IF EXISTS pain_points_extracted,
    DROP COLUMN IF EXISTS recognition_event,
    DROP COLUMN IF EXISTS notes,
    DROP COLUMN IF EXISTS comment_text,
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS timestamp;

-- Drop the update trigger (no longer needed)
DROP TRIGGER IF EXISTS engagement_log_updated_at ON engagement_log;
DROP FUNCTION IF EXISTS update_engagement_log_updated_at();
