-- Phase 6: Consolidate files + articles → content table
-- Also updates charts FK and user_settings FK

-- ============================================================================
-- STEP 1: Create unified content table
-- ============================================================================
CREATE TABLE content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('chat', 'reader')),
  title TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  artisan_cut TEXT,                    -- NULL for reader mode (ephemeral)
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_content_user_id ON content(user_id);
CREATE INDEX idx_content_mode ON content(user_id, mode);
CREATE INDEX idx_content_enabled ON content(user_id, is_enabled) WHERE is_enabled = true;
CREATE INDEX idx_content_created_at ON content(created_at DESC);

-- Enable RLS
ALTER TABLE content ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own content" ON content
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert own content" ON content
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own content" ON content
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own content" ON content
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_updated_at
  BEFORE UPDATE ON content
  FOR EACH ROW
  EXECUTE FUNCTION update_content_updated_at();

-- Comments
COMMENT ON TABLE content IS 'Unified storage for pasted content (files + articles). Mode distinguishes chat vs reader.';
COMMENT ON COLUMN content.mode IS 'chat = file paste, reader = article paste';
COMMENT ON COLUMN content.raw_content IS 'Original pasted HTML/text content';
COMMENT ON COLUMN content.artisan_cut IS 'AI-compressed version for context injection (chat mode only)';

-- ============================================================================
-- STEP 2: Migrate data from files → content
-- ============================================================================
INSERT INTO content (id, user_id, mode, title, raw_content, artisan_cut, is_enabled, created_at, updated_at)
SELECT id, user_id, 'chat', title, raw_content, artisan_cut, COALESCE(is_enabled, false), created_at, updated_at
FROM files;

-- ============================================================================
-- STEP 3: Migrate data from articles → content
-- ============================================================================
INSERT INTO content (id, user_id, mode, title, raw_content, artisan_cut, is_enabled, created_at, updated_at)
SELECT id, user_id, 'reader', title, COALESCE(raw_html, ''), NULL, true, created_at, updated_at
FROM articles;

-- ============================================================================
-- STEP 4: Add content_id to charts, migrate data
-- ============================================================================
ALTER TABLE charts ADD COLUMN content_id UUID REFERENCES content(id) ON DELETE CASCADE;

-- Update charts: file_id → content_id
UPDATE charts SET content_id = file_id WHERE file_id IS NOT NULL;

-- Update charts: article_id → content_id
UPDATE charts SET content_id = article_id WHERE article_id IS NOT NULL;

-- Create index for content_id
CREATE INDEX idx_charts_content_id ON charts(content_id) WHERE content_id IS NOT NULL;

-- ============================================================================
-- STEP 5: Update user_settings FK
-- ============================================================================
-- Drop old FK constraint (try both possible names)
ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS fk_active_reader_article;
ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_active_reader_article_id_fkey;

-- Rename column
ALTER TABLE user_settings RENAME COLUMN active_reader_article_id TO active_content_id;

-- Add new FK constraint
ALTER TABLE user_settings
  ADD CONSTRAINT fk_active_content
  FOREIGN KEY (active_content_id) REFERENCES content(id) ON DELETE SET NULL;

-- ============================================================================
-- STEP 6: Update superjournal.content_id FK (currently references articles)
-- ============================================================================
-- Drop old FK constraint
ALTER TABLE superjournal DROP CONSTRAINT IF EXISTS superjournal_content_id_fkey;

-- Add new FK constraint to content table
ALTER TABLE superjournal
  ADD CONSTRAINT superjournal_content_id_fkey
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE;

-- ============================================================================
-- STEP 7: Update charts constraint to use content_id
-- ============================================================================
-- Drop old constraint
ALTER TABLE charts DROP CONSTRAINT IF EXISTS charts_single_parent;

-- Add new constraint (content_id OR superjournal_id, never both)
ALTER TABLE charts ADD CONSTRAINT charts_single_parent CHECK (
  (content_id IS NOT NULL AND superjournal_id IS NULL) OR
  (content_id IS NULL AND superjournal_id IS NOT NULL)
);

-- ============================================================================
-- STEP 8: Drop old columns from charts
-- ============================================================================
ALTER TABLE charts DROP COLUMN IF EXISTS file_id;
ALTER TABLE charts DROP COLUMN IF EXISTS article_id;

-- Drop old indexes
DROP INDEX IF EXISTS idx_charts_file_id;
DROP INDEX IF EXISTS idx_charts_article_id;

-- ============================================================================
-- STEP 9: Drop old chart tables (data already migrated in Phase 5)
-- ============================================================================
DROP TABLE IF EXISTS file_charts CASCADE;
DROP TABLE IF EXISTS article_charts CASCADE;
DROP TABLE IF EXISTS superjournal_charts CASCADE;
DROP TABLE IF EXISTS article_chat_charts CASCADE;

-- ============================================================================
-- STEP 10: Drop article_chat table (obsolete after Phase 4)
-- ============================================================================
DROP TABLE IF EXISTS article_chat CASCADE;

-- ============================================================================
-- STEP 11: Drop old content tables
-- ============================================================================
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS articles CASCADE;

-- Update comments
COMMENT ON COLUMN charts.content_id IS 'FK to content table for uploaded content charts';
