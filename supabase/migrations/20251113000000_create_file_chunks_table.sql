-- Create file_chunks table for semantic chunking
-- Each file in the files table gets split into multiple chunks
-- Chunk 0: File-level overview (metadata, purpose, structure)
-- Chunks 1+: Semantic detail chunks based on embedding similarity

CREATE TABLE IF NOT EXISTS public.file_chunks (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign key to files table (cascade delete)
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,

    -- User relationship (denormalized for RLS and faster queries)
    -- Nullable, no FK constraint (auth doesn't exist yet; will be added in multi-user branch)
    user_id UUID,

    -- Chunk identification
    chunk_index INTEGER NOT NULL,
    -- chunk_index = 0: File overview (Chunk 0, ALWAYS present)
    -- chunk_index >= 1: Detail chunks from semantic chunking

    -- Original text content of this chunk
    chunk_text TEXT NOT NULL,

    -- Artisan Cut compressed description of this chunk
    -- Generated via CHUNK_0_COMPRESSION_PROMPT (for chunk 0)
    -- or MODIFIED_CALL2A_PROMPT (for detail chunks)
    description TEXT NOT NULL,

    -- Voyage AI voyage-3 embedding (1024 dimensions)
    -- Generated from the description field (not raw chunk_text)
    embedding VECTOR(1024) NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure unique chunk indexes per file
    CONSTRAINT unique_file_chunk UNIQUE(file_id, chunk_index)
);

-- Add comments for documentation
COMMENT ON TABLE public.file_chunks IS 'Stores semantic chunks from uploaded files. Each file has Chunk 0 (overview) plus detail chunks based on topic boundaries.';
COMMENT ON COLUMN public.file_chunks.id IS 'Unique identifier for the chunk';
COMMENT ON COLUMN public.file_chunks.file_id IS 'Parent file (references files.id, cascade delete)';
COMMENT ON COLUMN public.file_chunks.user_id IS 'Owner of the chunk (denormalized from files table for RLS)';
COMMENT ON COLUMN public.file_chunks.chunk_index IS 'Sequential index: 0 = file overview (Chunk 0), 1+ = detail chunks';
COMMENT ON COLUMN public.file_chunks.chunk_text IS 'Original text content of this chunk (raw, uncompressed)';
COMMENT ON COLUMN public.file_chunks.description IS 'Artisan Cut compressed chunk description (used for embeddings)';
COMMENT ON COLUMN public.file_chunks.embedding IS '1024-dimensional vector embedding from Voyage AI voyage-3 model. Generated from description field. Used for semantic search to find relevant chunks across all files.';
COMMENT ON COLUMN public.file_chunks.created_at IS 'Timestamp when chunk was created';

-- Create indexes

-- Index on file_id (for querying all chunks of a specific file)
CREATE INDEX idx_file_chunks_file_id ON public.file_chunks(file_id);

-- Composite index on file_id + chunk_index (for ordered chunk retrieval)
CREATE INDEX idx_file_chunks_file_id_chunk_index ON public.file_chunks(file_id, chunk_index);

-- Index on user_id (for querying user's chunks)
CREATE INDEX idx_file_chunks_user_id ON public.file_chunks(user_id);

-- Index on chunk_index (for filtering Chunk 0 vs detail chunks)
CREATE INDEX idx_file_chunks_chunk_index ON public.file_chunks(chunk_index);

-- HNSW index for fast vector similarity search on embeddings
-- This is the CRITICAL index for semantic search across all file chunks
CREATE INDEX idx_file_chunks_embedding ON public.file_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
    -- m = 16: Number of connections per layer (higher = better recall, more memory)
    -- ef_construction = 64: Build-time search depth (higher = better index quality, slower build)

-- Enable Row Level Security (RLS)
ALTER TABLE public.file_chunks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (will be disabled for early development)

-- Policy: Users can only view their own file chunks
CREATE POLICY "Users can view their own file chunks"
    ON public.file_chunks
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can only insert chunks for their own files
CREATE POLICY "Users can insert their own file chunks"
    ON public.file_chunks
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own file chunks
CREATE POLICY "Users can update their own file chunks"
    ON public.file_chunks
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Users can only delete their own file chunks
CREATE POLICY "Users can delete their own file chunks"
    ON public.file_chunks
    FOR DELETE
    USING (auth.uid() = user_id);

-- Disable RLS for early development (matching files table pattern)
-- Policies defined above will be ready when auth is implemented
DROP POLICY IF EXISTS "Users can view their own file chunks" ON public.file_chunks;
DROP POLICY IF EXISTS "Users can insert their own file chunks" ON public.file_chunks;
DROP POLICY IF EXISTS "Users can update their own file chunks" ON public.file_chunks;
DROP POLICY IF EXISTS "Users can delete their own file chunks" ON public.file_chunks;

ALTER TABLE public.file_chunks DISABLE ROW LEVEL SECURITY;

-- Enable Supabase Realtime for progress updates (optional, but consistent with files table)
ALTER PUBLICATION supabase_realtime ADD TABLE public.file_chunks;

-- Create vector search function for file chunks
-- Returns semantically similar chunks across ALL files for a given query
CREATE OR REPLACE FUNCTION search_file_chunks(
    query_embedding VECTOR(1024),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5,
    filter_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    file_id UUID,
    chunk_index INT,
    chunk_text TEXT,
    description TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        fc.id,
        fc.file_id,
        fc.chunk_index,
        fc.chunk_text,
        fc.description,
        1 - (fc.embedding <=> query_embedding) AS similarity
    FROM public.file_chunks fc
    WHERE
        -- Filter by user if provided (NULL = all users)
        (filter_user_id IS NULL OR fc.user_id = filter_user_id)
        -- Only return chunks above similarity threshold
        AND 1 - (fc.embedding <=> query_embedding) >= match_threshold
    ORDER BY fc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Add function comment
COMMENT ON FUNCTION search_file_chunks IS 'Semantic search across file chunks using cosine similarity. Returns top N most similar chunks above threshold. Set filter_user_id=NULL to search all users (for shared knowledge).';

-- Create helper function to get all chunks for a specific file (ordered)
CREATE OR REPLACE FUNCTION get_file_chunks(
    p_file_id UUID
)
RETURNS TABLE (
    id UUID,
    chunk_index INT,
    chunk_text TEXT,
    description TEXT,
    embedding VECTOR(1024),
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        fc.id,
        fc.chunk_index,
        fc.chunk_text,
        fc.description,
        fc.embedding,
        fc.created_at
    FROM public.file_chunks fc
    WHERE fc.file_id = p_file_id
    ORDER BY fc.chunk_index ASC;
END;
$$;

-- Add function comment
COMMENT ON FUNCTION get_file_chunks IS 'Get all chunks for a specific file in order (Chunk 0 first, then detail chunks). Used for file reconstruction and display.';
