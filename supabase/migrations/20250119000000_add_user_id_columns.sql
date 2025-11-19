-- Chunk 2: Add user_id columns for multiuser isolation
-- Migration: Add user_id UUID NOT NULL columns to all user-owned tables
-- Pre-condition: Database is empty (nuked before migration)
-- NOTE: Uses IF NOT EXISTS pattern since columns may already exist

-- CRITICAL: Delete any existing data with NULL user_id before adding NOT NULL constraint
-- This handles the case where nuke_everything() was called but left schema intact
-- Check if column exists before trying to delete
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='superjournal' AND column_name='user_id') THEN
    DELETE FROM superjournal WHERE user_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='journal' AND column_name='user_id') THEN
    DELETE FROM journal WHERE user_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='files' AND column_name='user_id') THEN
    DELETE FROM files WHERE user_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='user_id') THEN
    DELETE FROM user_settings WHERE user_id IS NULL;
  END IF;
END $$;

-- Add user_id column to superjournal (conversation working memory - last 5 turns)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='superjournal' AND column_name='user_id') THEN
    ALTER TABLE superjournal ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id column to journal (compressed memory with embeddings)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='journal' AND column_name='user_id') THEN
    ALTER TABLE journal ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id column to files (uploaded file metadata)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='files' AND column_name='user_id') THEN
    ALTER TABLE files ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id column to user_settings (user preferences)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='user_id') THEN
    ALTER TABLE user_settings ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- NOTE: file_chunks does NOT get user_id column
-- Ownership is inherited via foreign key to files table
-- Adding user_id would create:
--   - Redundant index maintenance overhead
--   - Double storage overhead
--   - Consistency risk (chunk.user_id could diverge from file.user_id)

-- Create indexes on user_id columns for fast query performance
CREATE INDEX IF NOT EXISTS idx_superjournal_user_id ON superjournal(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_user_id ON journal(user_id);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Verify CASCADE delete works (should cascade to file_chunks via files foreign key)
-- Test manually after migration:
-- 1. Create test user: INSERT INTO auth.users (id, ...) VALUES (gen_random_uuid(), ...);
-- 2. Insert test data with test user_id
-- 3. DELETE FROM auth.users WHERE id = test_user_id;
-- 4. Verify all related rows deleted from superjournal, journal, files, file_chunks, user_settings
