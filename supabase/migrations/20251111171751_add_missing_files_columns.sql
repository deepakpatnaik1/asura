-- Add missing columns to existing files table
-- The files table was created in old work but is missing key columns needed for T2 tests

-- Add description column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'files'
        AND column_name = 'description'
    ) THEN
        ALTER TABLE public.files ADD COLUMN description TEXT;
    END IF;
END $$;

-- Add embedding column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'files'
        AND column_name = 'embedding'
    ) THEN
        ALTER TABLE public.files ADD COLUMN embedding VECTOR(1024);
    END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'files'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.files ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN public.files.description IS 'Artisan Cut compressed file content (from Modified Call 2A/2B)';
COMMENT ON COLUMN public.files.embedding IS '1024-dimensional vector embedding from Voyage AI voyage-3 model. Used for semantic search and similarity matching of file contents. Indexed with HNSW for fast approximate nearest neighbor queries.';
COMMENT ON COLUMN public.files.updated_at IS 'Timestamp of last update (for progress tracking)';

-- Create HNSW index for vector similarity search if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_files_embedding ON public.files
    USING hnsw (embedding vector_cosine_ops);

-- Create trigger to automatically update updated_at timestamp if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_files_updated_at ON public.files;
CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON public.files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
