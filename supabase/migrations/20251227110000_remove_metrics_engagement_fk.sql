-- Remove FK between metrics and engagement_log
-- These are intentionally separate tables with no relationship

ALTER TABLE metrics DROP CONSTRAINT IF EXISTS metrics_engagement_id_fkey;
ALTER TABLE metrics DROP COLUMN IF EXISTS engagement_id;
DROP INDEX IF EXISTS idx_metrics_engagement_id;
