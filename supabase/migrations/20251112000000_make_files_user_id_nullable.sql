-- Make user_id nullable in files table for development
-- This allows file uploads without authentication during early development
-- Matches the pattern from migration 20251108000004_make_user_id_nullable.sql
-- Will be reverted to NOT NULL when proper auth is implemented (Chunk 11)

ALTER TABLE public.files
ALTER COLUMN user_id DROP NOT NULL;
