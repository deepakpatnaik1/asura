-- Drop engagement_log table
-- This table was used for deduplication but provided no practical value.
-- Reddit metrics are captured via fetch-metrics.js from Reddit API.
-- Discord has no API for comment metrics.

DROP TABLE IF EXISTS engagement_log;
