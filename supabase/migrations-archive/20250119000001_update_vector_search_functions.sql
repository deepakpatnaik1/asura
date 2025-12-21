-- Chunk 2: Update vector search functions for multiuser isolation
-- Fix NULL leak in search_journal_by_embedding()
-- Add proper user_id filtering to search_file_chunks()

-- Update search_journal_by_embedding to enforce user isolation
-- CRITICAL FIX: Remove "OR j.user_id IS NULL" clause (line 33 of original)
-- This clause would leak legacy NULL user_id data to all users
CREATE OR REPLACE FUNCTION search_journal_by_embedding(
  query_embedding TEXT,
  match_count INT DEFAULT 50,
  exclude_ids UUID[] DEFAULT '{}',
  user_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  boss_essence TEXT,
  persona_essence TEXT,
  decision_arc_summary TEXT,
  salience_score INT,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.boss_essence,
    j.persona_essence,
    j.decision_arc_summary,
    j.salience_score,
    j.created_at,
    1 - (j.embedding <=> query_embedding::vector) AS similarity
  FROM journal j
  WHERE j.embedding IS NOT NULL
    AND j.is_instruction = false
    AND NOT (j.id = ANY(exclude_ids))
    AND (user_id_filter IS NULL OR j.user_id = user_id_filter)  -- FIXED: Removed "OR j.user_id IS NULL"
  ORDER BY j.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;

-- Update search_file_chunks to filter by user_id via files table JOIN
CREATE OR REPLACE FUNCTION search_file_chunks(
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  user_id_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  file_id uuid,
  chunk_index int,
  chunk_text text,
  boss_essence text,
  persona_essence text,
  decision_arc_summary text,
  salience_score int,
  similarity float
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
    fc.boss_essence,
    fc.persona_essence,
    fc.decision_arc_summary,
    fc.salience_score,
    1 - (fc.embedding <=> query_embedding) AS similarity
  FROM file_chunks fc
  INNER JOIN files f ON fc.file_id = f.id
  WHERE fc.embedding <=> query_embedding < match_threshold
    AND (user_id_filter IS NULL OR f.user_id = user_id_filter)  -- Filter via files table
  ORDER BY fc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
