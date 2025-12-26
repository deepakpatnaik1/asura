-- Create raw_intel table for capturing Reddit tool outputs
-- Used for product intelligence: Ananya's observations are logged automatically,
-- then Claude Code (Boss's Opus instance) processes them into intel summaries.

CREATE TABLE raw_intel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Tool context
    tool_name TEXT NOT NULL,          -- fetch_reddit_thread, fetch_subreddit_posts
    subreddit TEXT,                   -- Subreddit name (if applicable)
    url TEXT,                         -- Thread/subreddit URL

    -- Raw data
    raw_data JSONB NOT NULL,          -- Full tool output (posts, comments, etc.)

    -- Metadata
    persona TEXT DEFAULT 'ananya'     -- Which persona triggered this capture
);

-- Index for querying by user and time
CREATE INDEX raw_intel_user_created ON raw_intel(user_id, created_at DESC);

-- Index for querying by subreddit
CREATE INDEX raw_intel_subreddit ON raw_intel(subreddit);

-- RLS: Users can only see their own intel
ALTER TABLE raw_intel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own intel"
    ON raw_intel FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own intel"
    ON raw_intel FOR INSERT
    WITH CHECK (auth.uid() = user_id);
