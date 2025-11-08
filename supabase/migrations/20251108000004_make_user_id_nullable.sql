-- Make user_id nullable in both tables for development
-- This allows inserts without authentication
-- Will be reverted to NOT NULL when proper auth is implemented

-- Make user_id nullable in superjournal
ALTER TABLE public.superjournal
ALTER COLUMN user_id DROP NOT NULL;

-- Make user_id nullable in journal
ALTER TABLE public.journal
ALTER COLUMN user_id DROP NOT NULL;
