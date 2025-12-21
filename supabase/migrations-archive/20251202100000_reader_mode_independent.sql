-- Historical migration - adds mode column
-- NOTE: mode columns are dropped by 20251206000000_simplification.sql

ALTER TABLE public.superjournal
DROP CONSTRAINT IF EXISTS superjournal_mode_content_check;

ALTER TABLE public.journal
ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'chat';

CREATE INDEX IF NOT EXISTS idx_journal_mode ON public.journal(mode);
