-- Remove instruction fields from journal table (simplify to star-only persistent memory)
-- Stars become the sole mechanism for persistent memory across both modes

-- Drop instruction columns from journal
ALTER TABLE journal DROP COLUMN IF EXISTS is_instruction;
ALTER TABLE journal DROP COLUMN IF EXISTS instruction_scope;

-- Update vector search function to remove is_instruction filter
CREATE OR REPLACE FUNCTION search_journal_by_embedding(
  query_embedding TEXT,
  match_count INT DEFAULT 50,
  exclude_ids UUID[] DEFAULT '{}',
  user_id_filter UUID DEFAULT NULL,
  mode_filter TEXT DEFAULT NULL
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
    AND (mode_filter IS NULL OR j.mode = mode_filter)
  ORDER BY j.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;
