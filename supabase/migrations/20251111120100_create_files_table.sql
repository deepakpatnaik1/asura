-- Create Files table
-- Stores uploaded file metadata, Artisan Cut descriptions, and embeddings

-- File type enum
CREATE TYPE file_type_enum AS ENUM (
    'pdf',
    'image',
    'text',
    'code',
    'spreadsheet',
    'other'
);

-- Processing status enum
CREATE TYPE file_status_enum AS ENUM (
    'pending',
    'processing',
    'ready',
    'failed'
);

-- Processing stage enum
CREATE TYPE processing_stage_enum AS ENUM (
    'extraction',
    'compression',
    'embedding',
    'finalization'
);

-- Create files table
CREATE TABLE IF NOT EXISTS public.files (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User relationship (foreign key to auth.users)
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- File metadata
    filename TEXT NOT NULL,
    file_type file_type_enum NOT NULL DEFAULT 'other',

    -- Deduplication
    content_hash TEXT NOT NULL,

    -- Artisan Cut compressed description (from Modified Call 2A/2B)
    description TEXT,

    -- Voyage AI voyage-3 embedding (1024 dimensions)
    embedding VECTOR(1024),

    -- Processing state
    status file_status_enum NOT NULL DEFAULT 'pending',
    processing_stage processing_stage_enum,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    error_message TEXT,

    -- Timestamps
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE public.files IS 'Stores uploaded files with Artisan Cut descriptions and embeddings';
COMMENT ON COLUMN public.files.id IS 'Unique identifier for the file';
COMMENT ON COLUMN public.files.user_id IS 'Owner of the file (references auth.users)';
COMMENT ON COLUMN public.files.filename IS 'Original filename including extension';
COMMENT ON COLUMN public.files.file_type IS 'File category: pdf, image, text, code, spreadsheet, other';
COMMENT ON COLUMN public.files.content_hash IS 'SHA-256 hash for deduplication';
COMMENT ON COLUMN public.files.description IS 'Artisan Cut compressed file content (from Modified Call 2A/2B)';
COMMENT ON COLUMN public.files.embedding IS '1024-dimensional vector embedding from Voyage AI voyage-3 model. Used for semantic search and similarity matching of file contents. Indexed with HNSW for fast approximate nearest neighbor queries.';
COMMENT ON COLUMN public.files.status IS 'Processing status: pending, processing, ready, failed';
COMMENT ON COLUMN public.files.processing_stage IS 'Current stage: extraction, compression, embedding, finalization';
COMMENT ON COLUMN public.files.progress IS 'Processing progress (0-100%)';
COMMENT ON COLUMN public.files.error_message IS 'Error details if status=failed (nullable)';
COMMENT ON COLUMN public.files.uploaded_at IS 'Timestamp when file was uploaded';
COMMENT ON COLUMN public.files.updated_at IS 'Timestamp of last update (for progress tracking)';

-- Create indexes

-- Index on user_id (for querying user's files)
CREATE INDEX idx_files_user_id ON public.files(user_id);

-- Composite index on user_id + status (common query: list user's ready files)
CREATE INDEX idx_files_user_id_status ON public.files(user_id, status);

-- Index on content_hash (for deduplication checks)
CREATE INDEX idx_files_content_hash ON public.files(content_hash);

-- Index on status (for filtering by processing state)
CREATE INDEX idx_files_status ON public.files(status);

-- Index on uploaded_at (for chronological ordering)
CREATE INDEX idx_files_uploaded_at ON public.files(uploaded_at DESC);

-- HNSW index for vector similarity search on embeddings
CREATE INDEX idx_files_embedding ON public.files
    USING hnsw (embedding vector_cosine_ops);

-- Enable Row Level Security (RLS)
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (will be disabled by existing migration 20251108000003)

-- Policy: Users can only view their own files
CREATE POLICY "Users can view their own files"
    ON public.files
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can only insert files for themselves
CREATE POLICY "Users can insert their own files"
    ON public.files
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own files
CREATE POLICY "Users can update their own files"
    ON public.files
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Users can only delete their own files
CREATE POLICY "Users can delete their own files"
    ON public.files
    FOR DELETE
    USING (auth.uid() = user_id);

-- Disable RLS for early development (matching journal/superjournal pattern)
-- Policies defined above will be ready when auth is implemented
-- This matches migration 20251108000003_disable_rls.sql pattern

DROP POLICY IF EXISTS "Users can view their own files" ON public.files;
DROP POLICY IF EXISTS "Users can insert their own files" ON public.files;
DROP POLICY IF EXISTS "Users can update their own files" ON public.files;
DROP POLICY IF EXISTS "Users can delete their own files" ON public.files;

ALTER TABLE public.files DISABLE ROW LEVEL SECURITY;

-- Enable Supabase Realtime for Server-Sent Events (SSE)
ALTER PUBLICATION supabase_realtime ADD TABLE public.files;

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON public.files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
