-- Create RPC function for vector similarity search with exclusions
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
    AND (user_id_filter IS NULL OR j.user_id = user_id_filter OR j.user_id IS NULL)
  ORDER BY j.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;
