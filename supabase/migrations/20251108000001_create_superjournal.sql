-- Create Superjournal table
-- Stores full, uncompressed conversation turns

CREATE TABLE IF NOT EXISTS public.superjournal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    persona_name TEXT NOT NULL,
    user_message TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_starred BOOLEAN NOT NULL DEFAULT false
);

-- Create index on user_id for efficient querying
CREATE INDEX idx_superjournal_user_id ON public.superjournal(user_id);

-- Create index on created_at for efficient sorting
CREATE INDEX idx_superjournal_created_at ON public.superjournal(created_at DESC);

-- Create index on is_starred for efficient filtering
CREATE INDEX idx_superjournal_is_starred ON public.superjournal(is_starred) WHERE is_starred = true;

-- Enable Row Level Security
ALTER TABLE public.superjournal ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only access their own superjournal entries
CREATE POLICY "Users can view their own superjournal entries"
    ON public.superjournal
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own superjournal entries"
    ON public.superjournal
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own superjournal entries"
    ON public.superjournal
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own superjournal entries"
    ON public.superjournal
    FOR DELETE
    USING (auth.uid() = user_id);
