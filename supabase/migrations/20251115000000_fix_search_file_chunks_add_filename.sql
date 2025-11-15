-- Fix search_file_chunks function to include filename
-- Bug: The function was missing the filename column, causing file retrieval to fail

DROP FUNCTION IF EXISTS search_file_chunks(VECTOR(1024), FLOAT, INT, UUID);

CREATE OR REPLACE FUNCTION search_file_chunks(
    query_embedding VECTOR(1024),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5,
    filter_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    file_id UUID,
    filename TEXT,
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
        f.filename,
        fc.chunk_index,
        fc.chunk_text,
        fc.description,
        1 - (fc.embedding <=> query_embedding) AS similarity
    FROM public.file_chunks fc
    JOIN public.files f ON fc.file_id = f.id
    WHERE
        -- Filter by user if provided (NULL = all users)
        (filter_user_id IS NULL OR fc.user_id = filter_user_id)
        -- Only return chunks above similarity threshold
        AND 1 - (fc.embedding <=> query_embedding) >= match_threshold
    ORDER BY fc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION search_file_chunks IS 'Semantic search across file chunks using cosine similarity. Returns top N most similar chunks above threshold with filename. Set filter_user_id=NULL to search all users (for shared knowledge).';
