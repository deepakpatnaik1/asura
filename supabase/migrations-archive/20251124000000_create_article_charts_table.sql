-- Create article_charts table for e-reader image carousel feature
-- This table tracks individual chart/image PDFs extracted from articles

CREATE TABLE IF NOT EXISTS article_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_index INTEGER NOT NULL,  -- 1, 2, 3, etc. (sequential numbering)
  storage_path TEXT NOT NULL,    -- article-pdfs/{user_id}/{article_id}/chart-1.pdf
  thumbnail_path TEXT,           -- article-pdfs/{user_id}/{article_id}/chart-1-thumbnail.jpg
  anthropic_file_id TEXT,        -- Anthropic Files API file ID
  anthropic_file_created_at TIMESTAMPTZ,  -- Track file ID expiration
  is_relevant BOOLEAN DEFAULT true,  -- Result of AI filtering (ads removed)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure each article has unique chart indexes (no duplicates)
  UNIQUE(article_id, chart_index)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_article_charts_article_id ON article_charts(article_id);
CREATE INDEX IF NOT EXISTS idx_article_charts_user_id ON article_charts(user_id);

-- Enable Row-Level Security
ALTER TABLE article_charts ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same pattern as articles and article_chat tables)
DROP POLICY IF EXISTS "Users can view own charts" ON article_charts;
CREATE POLICY "Users can view own charts" ON article_charts
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own charts" ON article_charts;
CREATE POLICY "Users can insert own charts" ON article_charts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own charts" ON article_charts;
CREATE POLICY "Users can update own charts" ON article_charts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own charts" ON article_charts;
CREATE POLICY "Users can delete own charts" ON article_charts
  FOR DELETE USING (auth.uid() = user_id);

-- Add performance indexes to articles table (recommended from audit)
CREATE INDEX IF NOT EXISTS idx_articles_user_id ON articles(user_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at DESC);

-- Comment for documentation
COMMENT ON TABLE article_charts IS 'Stores metadata for individual chart/image PDFs extracted from articles. Used for canvas carousel display with AI-powered ad filtering.';
COMMENT ON COLUMN article_charts.is_relevant IS 'AI filtering result: true = relevant chart/diagram, false = ad/irrelevant image';
