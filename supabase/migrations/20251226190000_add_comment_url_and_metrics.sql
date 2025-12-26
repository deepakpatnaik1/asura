-- Add comment_url to engagement_log for tracking specific comments
ALTER TABLE engagement_log ADD COLUMN IF NOT EXISTS comment_url text;

-- Create metrics table for 48-hour post-engagement snapshots
CREATE TABLE IF NOT EXISTS metrics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id uuid REFERENCES engagement_log(id) ON DELETE CASCADE,
    comment_url text NOT NULL,
    subreddit text NOT NULL,
    thread_title text,
    upvotes integer NOT NULL DEFAULT 0,
    replies integer NOT NULL DEFAULT 0,
    position integer,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying by engagement
CREATE INDEX IF NOT EXISTS idx_metrics_engagement_id ON metrics(engagement_id);
