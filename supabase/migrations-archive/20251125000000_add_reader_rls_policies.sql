-- ============================================================================
-- Migration: Add RLS Policies for E-Reader Tables
-- Description: Adds missing RLS policies for articles, article_charts, and
--              article_chat tables. Also renames note_id to article_id in
--              article_chat for consistency.
-- Bug Reference: B-001 (T-003) - Article creation fails with RLS policy violation
-- ============================================================================

-- ============================================================================
-- PART 1: (SKIPPED) Column already named article_id in database
-- ============================================================================
-- The article_chat table already has article_id column (not note_id).
-- No rename needed.

-- ============================================================================
-- PART 2: RLS Policies for articles table
-- ============================================================================

-- Drop existing policies if any (safety)
DROP POLICY IF EXISTS "Users can view own articles" ON articles;
DROP POLICY IF EXISTS "Users can insert own articles" ON articles;
DROP POLICY IF EXISTS "Users can update own articles" ON articles;
DROP POLICY IF EXISTS "Users can delete own articles" ON articles;

-- SELECT: Users see their own articles, admins see all
CREATE POLICY "Users can view own articles" ON articles
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- INSERT: Users can create articles with their own user_id
CREATE POLICY "Users can insert own articles" ON articles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can update their own articles
CREATE POLICY "Users can update own articles" ON articles
  FOR UPDATE USING (auth.uid() = user_id);

-- DELETE: Users can delete their own articles
CREATE POLICY "Users can delete own articles" ON articles
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PART 3: RLS Policies for article_charts table
-- (Re-applying policies from unapplied migration 20251124000000)
-- ============================================================================

-- Drop existing policies if any (safety)
DROP POLICY IF EXISTS "Users can view own charts" ON article_charts;
DROP POLICY IF EXISTS "Users can insert own charts" ON article_charts;
DROP POLICY IF EXISTS "Users can update own charts" ON article_charts;
DROP POLICY IF EXISTS "Users can delete own charts" ON article_charts;

-- SELECT: Users see their own charts, admins see all
CREATE POLICY "Users can view own charts" ON article_charts
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- INSERT: Users can create charts with their own user_id
CREATE POLICY "Users can insert own charts" ON article_charts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can update their own charts
CREATE POLICY "Users can update own charts" ON article_charts
  FOR UPDATE USING (auth.uid() = user_id);

-- DELETE: Users can delete their own charts
CREATE POLICY "Users can delete own charts" ON article_charts
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PART 4: RLS Policies for article_chat table
-- ============================================================================

-- Drop existing policies if any (safety)
DROP POLICY IF EXISTS "Users can view own chat" ON article_chat;
DROP POLICY IF EXISTS "Users can insert own chat" ON article_chat;
DROP POLICY IF EXISTS "Users can update own chat" ON article_chat;
DROP POLICY IF EXISTS "Users can delete own chat" ON article_chat;

-- SELECT: Users see their own chat history, admins see all
CREATE POLICY "Users can view own chat" ON article_chat
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- INSERT: Users can create chat messages with their own user_id
CREATE POLICY "Users can insert own chat" ON article_chat
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can update their own chat messages
CREATE POLICY "Users can update own chat" ON article_chat
  FOR UPDATE USING (auth.uid() = user_id);

-- DELETE: Users can delete their own chat messages
CREATE POLICY "Users can delete own chat" ON article_chat
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PART 5: Add indexes for performance (if not exists)
-- ============================================================================

-- article_chat indexes
CREATE INDEX IF NOT EXISTS idx_article_chat_article_id ON article_chat(article_id);
CREATE INDEX IF NOT EXISTS idx_article_chat_user_id ON article_chat(user_id);
CREATE INDEX IF NOT EXISTS idx_article_chat_created_at ON article_chat(created_at DESC);

-- ============================================================================
-- Verification Queries (run manually after applying)
-- ============================================================================

-- 1. Verify article_chat has article_id column
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'article_chat' AND column_name = 'article_id';

-- 2. Check all policies exist
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('articles', 'article_charts', 'article_chat')
-- ORDER BY tablename, policyname;

-- 3. Test as authenticated user (should only see own data)
-- SELECT COUNT(*) FROM articles;
-- SELECT COUNT(*) FROM article_charts;
-- SELECT COUNT(*) FROM article_chat;

-- ============================================================================
-- Expected Outcome
-- ============================================================================

-- After this migration:
-- articles: 4 policies (SELECT, INSERT, UPDATE, DELETE)
-- article_charts: 4 policies (SELECT, INSERT, UPDATE, DELETE)
-- article_chat: 4 policies (SELECT, INSERT, UPDATE, DELETE)
--
-- All e-reader operations will work with proper user isolation.
-- Admins can view all users' data for support/debugging.
