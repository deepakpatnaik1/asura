-- ============================================================================
-- Migration: Enable RLS and Create Missing Policies for Multiuser Support
-- Description: Creates RLS policies for models, user_settings, model_parameters
--              and re-enables RLS that was disabled in early development
-- Dependencies:
--   - 20251108000001_create_superjournal.sql (has policies)
--   - 20251108000002_create_journal.sql (has policies)
--   - 20250119200000_create_token_usage_table.sql (has policies)
--   - 20251108000003_disable_rls.sql (disabled RLS for development)
-- ============================================================================

-- ============================================================================
-- PART 1: Re-enable RLS on tables that were disabled
-- ============================================================================

-- These tables already have policies from their creation migrations
-- We just need to re-enable RLS enforcement
ALTER TABLE superjournal ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 2: Create RLS policies for user_settings table
-- ============================================================================

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Users can only view their own settings
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
CREATE POLICY "Users can view own settings" ON user_settings
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own settings
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
CREATE POLICY "Users can insert own settings" ON user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own settings
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
CREATE POLICY "Users can update own settings" ON user_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own settings
DROP POLICY IF EXISTS "Users can delete own settings" ON user_settings;
CREATE POLICY "Users can delete own settings" ON user_settings
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PART 3: Create RLS policies for models table (read-only for all users)
-- ============================================================================

ALTER TABLE models ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view models (read-only catalog)
DROP POLICY IF EXISTS "Authenticated users can view models" ON models;
CREATE POLICY "Authenticated users can view models" ON models
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only service role can modify models (admin-only operations)
-- No INSERT/UPDATE/DELETE policies = blocked for regular users

-- ============================================================================
-- PART 4: Create RLS policies for model_parameters table (read-only for all users)
-- ============================================================================

ALTER TABLE model_parameters ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view model parameters (read-only catalog)
DROP POLICY IF EXISTS "Authenticated users can view model parameters" ON model_parameters;
CREATE POLICY "Authenticated users can view model parameters" ON model_parameters
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only service role can modify model_parameters (admin-only operations)
-- No INSERT/UPDATE/DELETE policies = blocked for regular users

-- ============================================================================
-- Verification Queries (run manually to verify RLS is working)
-- ============================================================================

-- 1. Check RLS is enabled on all tables
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('superjournal', 'journal', 'token_usage', 'user_settings', 'models', 'model_parameters')
-- ORDER BY tablename;

-- 2. Check all policies exist
-- SELECT tablename, policyname, cmd, qual FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;

-- 3. Test user isolation (as authenticated user via ANON_KEY client)
-- Should only return current user's data:
-- SELECT COUNT(*) FROM superjournal;
-- SELECT COUNT(*) FROM journal;
-- SELECT COUNT(*) FROM user_settings;

-- Should return all models (read-only catalog):
-- SELECT COUNT(*) FROM models;
-- SELECT COUNT(*) FROM model_parameters;

-- ============================================================================
-- Expected Outcome
-- ============================================================================

-- After this migration:
-- ✅ superjournal: RLS enabled, 4 policies (SELECT, INSERT, UPDATE, DELETE)
-- ✅ journal: RLS enabled, 4 policies (SELECT, INSERT, UPDATE, DELETE)
-- ✅ token_usage: RLS enabled, 2 policies (SELECT, INSERT)
-- ✅ user_settings: RLS enabled, 4 policies (SELECT, INSERT, UPDATE, DELETE)
-- ✅ models: RLS enabled, 1 policy (SELECT for authenticated users)
-- ✅ model_parameters: RLS enabled, 1 policy (SELECT for authenticated users)

-- Database-level security now enforces:
-- - Users can only see/modify their own data
-- - All users can read models catalog
-- - Service role bypasses RLS for admin operations