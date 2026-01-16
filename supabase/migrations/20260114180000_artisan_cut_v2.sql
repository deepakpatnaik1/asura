-- Artisan Cut v2 Schema Migration
-- Changes journal table from split boss_essence/persona_essence to unified turn_essence
-- Changes decision_arc_summary to conversation_arc
-- Changes persona_name to participants array

-- Step 1: Add new columns (nullable for migration)
ALTER TABLE journal ADD COLUMN IF NOT EXISTS turn_essence text;
ALTER TABLE journal ADD COLUMN IF NOT EXISTS participants text[];
ALTER TABLE journal ADD COLUMN IF NOT EXISTS conversation_arc text;

-- Step 2: Migrate existing data
UPDATE journal SET
  turn_essence = 'Boss: ' || boss_essence || E'\n' || persona_name || ': ' || persona_essence,
  participants = ARRAY['boss', lower(persona_name)],
  conversation_arc = decision_arc_summary
WHERE turn_essence IS NULL;

-- Step 3: Set defaults for any remaining NULLs (shouldn't happen, but safety)
UPDATE journal SET
  turn_essence = COALESCE(turn_essence, 'No content'),
  participants = COALESCE(participants, ARRAY['boss', 'unknown']),
  conversation_arc = COALESCE(conversation_arc, 'No arc generated')
WHERE turn_essence IS NULL OR participants IS NULL OR conversation_arc IS NULL;

-- Step 4: Make new columns NOT NULL
ALTER TABLE journal ALTER COLUMN turn_essence SET NOT NULL;
ALTER TABLE journal ALTER COLUMN participants SET NOT NULL;
ALTER TABLE journal ALTER COLUMN conversation_arc SET NOT NULL;

-- Step 5: Drop old columns
ALTER TABLE journal DROP COLUMN IF EXISTS boss_essence;
ALTER TABLE journal DROP COLUMN IF EXISTS persona_essence;
ALTER TABLE journal DROP COLUMN IF EXISTS decision_arc_summary;
ALTER TABLE journal DROP COLUMN IF EXISTS persona_name;

-- Step 6: Add index for participant filtering (for persona-specific queries)
CREATE INDEX IF NOT EXISTS idx_journal_participants ON journal USING GIN (participants);

-- Step 7: Update the main vector search function used by context-builder
-- Must drop first because return type is changing
DROP FUNCTION IF EXISTS search_journal_by_embedding(text,integer,uuid[],uuid,text);

CREATE OR REPLACE FUNCTION search_journal_by_embedding(
  query_embedding text,
  match_count integer DEFAULT 50,
  exclude_ids uuid[] DEFAULT '{}'::uuid[],
  user_id_filter uuid DEFAULT NULL::uuid,
  persona_name_filter text DEFAULT NULL::text
)
RETURNS TABLE (
  id uuid,
  turn_essence text,
  conversation_arc text,
  salience_score integer,
  created_at timestamptz,
  similarity double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.turn_essence,
    j.conversation_arc,
    j.salience_score,
    j.created_at,
    1 - (j.embedding <=> query_embedding::vector) AS similarity
  FROM journal j
  WHERE j.embedding IS NOT NULL
    AND NOT (j.id = ANY(exclude_ids))
    AND (user_id_filter IS NULL OR j.user_id = user_id_filter)
    AND (persona_name_filter IS NULL OR persona_name_filter = ANY(j.participants))
  ORDER BY j.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;
