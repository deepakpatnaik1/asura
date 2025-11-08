-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create Journal table
-- Stores Artisan Cut compressed turns and file descriptions

CREATE TABLE IF NOT EXISTS public.journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    superjournal_id UUID REFERENCES public.superjournal(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    persona_name TEXT NOT NULL,
    boss_essence TEXT NOT NULL,
    persona_essence TEXT NOT NULL,
    decision_arc_summary TEXT NOT NULL,
    salience_score INTEGER NOT NULL CHECK (salience_score >= 1 AND salience_score <= 10),
    is_starred BOOLEAN NOT NULL DEFAULT false,
    file_name TEXT,
    file_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    embedding vector(1536)
);

-- Create index on user_id for efficient querying
CREATE INDEX idx_journal_user_id ON public.journal(user_id);

-- Create index on created_at for efficient sorting
CREATE INDEX idx_journal_created_at ON public.journal(created_at DESC);

-- Create index on is_starred for efficient filtering
CREATE INDEX idx_journal_is_starred ON public.journal(is_starred) WHERE is_starred = true;

-- Create index on salience_score for efficient filtering
CREATE INDEX idx_journal_salience_score ON public.journal(salience_score DESC);

-- Create index on superjournal_id for cascading deletes
CREATE INDEX idx_journal_superjournal_id ON public.journal(superjournal_id);

-- Create HNSW index for vector similarity search
CREATE INDEX idx_journal_embedding ON public.journal
    USING hnsw (embedding vector_cosine_ops);

-- Enable Row Level Security
ALTER TABLE public.journal ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only access their own journal entries
CREATE POLICY "Users can view their own journal entries"
    ON public.journal
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own journal entries"
    ON public.journal
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own journal entries"
    ON public.journal
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own journal entries"
    ON public.journal
    FOR DELETE
    USING (auth.uid() = user_id);
