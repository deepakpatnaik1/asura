-- Make reader mode independent (not tied to articles)
-- Reader mode is now a standalone conversation space like chat mode

-- Drop constraint that required content_id for reader mode (if exists)
ALTER TABLE public.superjournal
DROP CONSTRAINT IF EXISTS superjournal_mode_content_check;

-- Add mode column to journal table for memory pyramid isolation
ALTER TABLE public.journal
ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'chat';

-- Create index on journal.mode for efficient filtering
CREATE INDEX IF NOT EXISTS idx_journal_mode ON public.journal(mode);

-- Comments
COMMENT ON COLUMN public.superjournal.mode IS 'Conversation space: chat or reader';
COMMENT ON COLUMN public.journal.mode IS 'Conversation space: chat or reader (matches superjournal)';
