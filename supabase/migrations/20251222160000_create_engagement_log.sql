-- Engagement Log for Ananya's community engagement tracking
-- Tracks every comment posted, outcomes, and extracted insights

CREATE TABLE engagement_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- When and where
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    subreddit TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'reddit',

    -- What was engaged
    post_url TEXT NOT NULL,
    post_title TEXT NOT NULL,
    comment_text TEXT NOT NULL,

    -- Outcomes (updated periodically)
    upvotes INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    reply_sentiment TEXT CHECK (reply_sentiment IN ('positive', 'neutral', 'negative')),

    -- Extracted insights
    pain_points_extracted TEXT[], -- Array of pain points identified
    recognition_event BOOLEAN DEFAULT FALSE, -- "I've seen you around" moments

    -- Notes
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_engagement_log_subreddit ON engagement_log(subreddit);
CREATE INDEX idx_engagement_log_timestamp ON engagement_log(timestamp DESC);
CREATE INDEX idx_engagement_log_platform ON engagement_log(platform);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_engagement_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER engagement_log_updated_at
    BEFORE UPDATE ON engagement_log
    FOR EACH ROW
    EXECUTE FUNCTION update_engagement_log_updated_at();
