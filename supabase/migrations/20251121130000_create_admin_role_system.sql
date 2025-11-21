-- ============================================================================
-- Migration: Create Admin Role System
-- Description: Implements admin role functionality with RLS policy bypass
-- Dependencies: 20251121120000_enable_rls_for_multiuser.sql
-- ============================================================================

-- ============================================================================
-- PART 1: Create user_roles table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast admin checks
CREATE INDEX IF NOT EXISTS idx_user_roles_is_admin ON user_roles(is_admin) WHERE is_admin = true;

-- Enable RLS on user_roles table
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Users can view their own role
DROP POLICY IF EXISTS "Users can view own role" ON user_roles;
CREATE POLICY "Users can view own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can modify roles (admin-only via API)
-- No INSERT/UPDATE/DELETE policies = blocked for regular users

-- ============================================================================
-- PART 2: Create admin helper function
-- ============================================================================

CREATE OR REPLACE FUNCTION is_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = check_user_id AND is_admin = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- PART 3: Update RLS policies with admin bypass
-- ============================================================================

-- Superjournal: Admin can view all entries
DROP POLICY IF EXISTS "Users can view their own superjournal entries" ON superjournal;
CREATE POLICY "Users can view their own superjournal entries" ON superjournal
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own superjournal entries" ON superjournal;
CREATE POLICY "Users can insert their own superjournal entries" ON superjournal
  FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can update their own superjournal entries" ON superjournal;
CREATE POLICY "Users can update their own superjournal entries" ON superjournal
  FOR UPDATE USING (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own superjournal entries" ON superjournal;
CREATE POLICY "Users can delete their own superjournal entries" ON superjournal
  FOR DELETE USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- Journal: Admin can view all entries
DROP POLICY IF EXISTS "Users can view own journal entries" ON journal;
CREATE POLICY "Users can view own journal entries" ON journal
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own journal entries" ON journal;
CREATE POLICY "Users can insert own journal entries" ON journal
  FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can update own journal entries" ON journal;
CREATE POLICY "Users can update own journal entries" ON journal
  FOR UPDATE USING (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own journal entries" ON journal;
CREATE POLICY "Users can delete own journal entries" ON journal
  FOR DELETE USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- Token Usage: Admin can view all usage
DROP POLICY IF EXISTS "Users can view own token usage" ON token_usage;
CREATE POLICY "Users can view own token usage" ON token_usage
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own token usage" ON token_usage;
CREATE POLICY "Users can insert own token usage" ON token_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin(auth.uid()));

-- User Settings: Admin can view all settings
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
CREATE POLICY "Users can view own settings" ON user_settings
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
CREATE POLICY "Users can insert own settings" ON user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
CREATE POLICY "Users can update own settings" ON user_settings
  FOR UPDATE USING (auth.uid() = user_id OR is_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own settings" ON user_settings;
CREATE POLICY "Users can delete own settings" ON user_settings
  FOR DELETE USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- ============================================================================
-- PART 4: Grant admin role to deepakpatnaik1@gmail.com
-- ============================================================================

-- Insert admin role for specified email
INSERT INTO user_roles (user_id, is_admin)
SELECT id, true FROM auth.users WHERE email = 'deepakpatnaik1@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET is_admin = true, updated_at = now();

-- ============================================================================
-- Verification Queries (run manually to verify admin system works)
-- ============================================================================

-- 1. Check admin role exists
-- SELECT u.email, r.is_admin, r.created_at
-- FROM auth.users u
-- LEFT JOIN user_roles r ON u.id = r.user_id
-- WHERE u.email = 'deepakpatnaik1@gmail.com';

-- 2. Test admin function
-- SELECT is_admin(id) as has_admin_access
-- FROM auth.users
-- WHERE email = 'deepakpatnaik1@gmail.com';

-- 3. Check updated policies
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('superjournal', 'journal', 'token_usage', 'user_settings')
-- ORDER BY tablename, policyname;

-- ============================================================================
-- Expected Outcome
-- ============================================================================

-- After this migration:
-- ✅ user_roles table created with RLS enabled
-- ✅ is_admin() helper function created
-- ✅ All user-data policies updated with admin bypass (auth.uid() = user_id OR is_admin(auth.uid()))
-- ✅ deepakpatnaik1@gmail.com granted admin role
--
-- Admin user can now:
-- - View all users' conversations (superjournal, journal)
-- - View all users' token usage
-- - View/modify all users' settings
-- - All operations respect RLS but admin bypasses user_id checks