-- Phase 5: Create unified charts table
-- Consolidates file_charts, article_charts, and superjournal_charts
-- Each chart links to exactly ONE parent: file_id, article_id, OR superjournal_id

CREATE TABLE charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Parent references (exactly one must be non-null)
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  superjournal_id UUID REFERENCES superjournal(id) ON DELETE CASCADE,

  -- Common columns
  chart_index INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  alt_text TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Article-specific columns (null for file/superjournal charts)
  anthropic_file_id TEXT,
  anthropic_file_created_at TIMESTAMPTZ,
  is_relevant BOOLEAN DEFAULT true,

  -- Constraint: exactly one parent must be set
  CONSTRAINT charts_single_parent CHECK (
    (file_id IS NOT NULL AND article_id IS NULL AND superjournal_id IS NULL) OR
    (file_id IS NULL AND article_id IS NOT NULL AND superjournal_id IS NULL) OR
    (file_id IS NULL AND article_id IS NULL AND superjournal_id IS NOT NULL)
  )
);

-- Indexes for performance
CREATE INDEX idx_charts_user_id ON charts(user_id);
CREATE INDEX idx_charts_file_id ON charts(file_id) WHERE file_id IS NOT NULL;
CREATE INDEX idx_charts_article_id ON charts(article_id) WHERE article_id IS NOT NULL;
CREATE INDEX idx_charts_superjournal_id ON charts(superjournal_id) WHERE superjournal_id IS NOT NULL;
CREATE INDEX idx_charts_not_dismissed ON charts(user_id, is_dismissed) WHERE is_dismissed = false;

-- Enable Row-Level Security
ALTER TABLE charts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own charts" ON charts
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert own charts" ON charts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own charts" ON charts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own charts" ON charts
  FOR DELETE USING (auth.uid() = user_id);

-- Migrate data from existing tables
-- 1. file_charts → charts
INSERT INTO charts (id, user_id, file_id, chart_index, storage_path, thumbnail_path, alt_text, is_pinned, created_at)
SELECT id, user_id, file_id, chart_index, storage_path, thumbnail_path, alt_text, COALESCE(is_pinned, false), created_at
FROM file_charts;

-- 2. article_charts → charts
INSERT INTO charts (id, user_id, article_id, chart_index, storage_path, thumbnail_path, alt_text, anthropic_file_id, anthropic_file_created_at, is_relevant, created_at)
SELECT id, user_id, article_id, chart_index, storage_path, thumbnail_path, alt_text, anthropic_file_id, anthropic_file_created_at, COALESCE(is_relevant, true), created_at
FROM article_charts;

-- 3. superjournal_charts → charts
INSERT INTO charts (id, user_id, superjournal_id, chart_index, storage_path, thumbnail_path, alt_text, is_pinned, is_dismissed, created_at)
SELECT id, user_id, superjournal_id, chart_index, storage_path, thumbnail_path, alt_text, COALESCE(is_pinned, false), COALESCE(is_dismissed, false), created_at
FROM superjournal_charts;

-- Comments
COMMENT ON TABLE charts IS 'Unified chart storage for files, articles, and superjournal entries. Replaces file_charts, article_charts, superjournal_charts.';
COMMENT ON COLUMN charts.file_id IS 'FK to files table for chat mode file uploads';
COMMENT ON COLUMN charts.article_id IS 'FK to articles table for reader mode articles';
COMMENT ON COLUMN charts.superjournal_id IS 'FK to superjournal for AI-generated tables';
COMMENT ON COLUMN charts.is_relevant IS 'AI filtering result for article charts (ads removed)';
