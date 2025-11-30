-- Add mode and content_id columns to superjournal
-- Supports routing reader conversations through superjournal

-- Add mode column (chat vs reader)
ALTER TABLE public.superjournal
ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'chat';

-- Add content_id column (FK to articles for reader mode, nullable)
ALTER TABLE public.superjournal
ADD COLUMN IF NOT EXISTS content_id UUID REFERENCES public.articles(id) ON DELETE CASCADE;

-- Create index on mode for efficient filtering
CREATE INDEX IF NOT EXISTS idx_superjournal_mode ON public.superjournal(mode);

-- Create index on content_id for reader mode filtering
CREATE INDEX IF NOT EXISTS idx_superjournal_content_id ON public.superjournal(content_id) WHERE content_id IS NOT NULL;

-- Add check constraint: reader mode requires content_id, chat mode must not have it
ALTER TABLE public.superjournal
ADD CONSTRAINT superjournal_mode_content_check
CHECK (
    (mode = 'chat' AND content_id IS NULL) OR
    (mode = 'reader' AND content_id IS NOT NULL)
);
