-- ============================================================================
-- Migration: Enable Row-Level Security (RLS) on all tables
-- Description: Activates database-level security enforcement for multiuser isolation
-- Dependencies:
--   - Chunk 1: Authentication foundation (hooks.server.ts uses ANON_KEY)
--   - Chunk 2: RLS policies created, user_id columns added
-- ============================================================================

-- Enable RLS on all user-scoped tables
-- Policies were created in previous migrations, this just enables enforcement

ALTER TABLE superjournal ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Enable RLS on models table (read-only for all authenticated users)
ALTER TABLE models ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Verification Queries (run manually to verify RLS is working)
-- ============================================================================

-- 1. Check RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('superjournal', 'journal', 'files', 'file_chunks', 'user_settings', 'models');

-- 2. Check policies exist
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;

-- 3. Test user isolation (run as authenticated user via ANON_KEY client)
-- Should only return rows where user_id = auth.uid()
-- SELECT COUNT(*) FROM files;
-- SELECT COUNT(*) FROM superjournal;
-- SELECT COUNT(*) FROM journal;

-- ============================================================================
-- Rollback (if needed)
-- ============================================================================

-- ALTER TABLE superjournal DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE journal DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE files DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE file_chunks DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE models DISABLE ROW LEVEL SECURITY;
