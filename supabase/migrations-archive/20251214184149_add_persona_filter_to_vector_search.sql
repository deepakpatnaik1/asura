-- Drop existing function variants to replace with persona-filtered version
DROP FUNCTION IF EXISTS search_journal_by_embedding(TEXT, INT, UUID[], UUID, TEXT);
DROP FUNCTION IF EXISTS search_journal_by_embedding(TEXT, INT, UUID[], UUID);

-- Add persona_name_filter to search_journal_by_embedding for persona-only semantic search
CREATE OR REPLACE FUNCTION search_journal_by_embedding(
  query_embedding TEXT,
  match_count INT DEFAULT 50,
  exclude_ids UUID[] DEFAULT '{}',
  user_id_filter UUID DEFAULT NULL,
  persona_name_filter TEXT DEFAULT NULL
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
    AND NOT (j.id = ANY(exclude_ids))
    AND (user_id_filter IS NULL OR j.user_id = user_id_filter)
    AND (persona_name_filter IS NULL OR j.persona_name = persona_name_filter)
  ORDER BY j.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION search_journal_by_embedding(TEXT, INT, UUID[], UUID, TEXT) IS 'Semantic search over journal entries. Supports persona-only filtering via persona_name_filter parameter.';
