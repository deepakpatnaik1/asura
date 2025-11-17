-- Remove foreign key constraint from files.user_id for development testing
-- This allows tests to insert files with arbitrary user_id values without requiring them to exist in auth.users
-- Matches the pattern from migration 20251108000004_make_user_id_nullable.sql
--
-- In production, this will be reverted when proper authentication is implemented

ALTER TABLE public.files
DROP CONSTRAINT IF EXISTS files_user_id_fkey;
