-- ASURA SIMPLIFICATION MIGRATION
-- Run in Supabase SQL Editor

-- STEP 1: NUKE ALL DATA
DELETE FROM charts;
DELETE FROM journal;
DELETE FROM superjournal;
DELETE FROM content;
DELETE FROM founder_diary;
DELETE FROM todos;
DELETE FROM tags;

-- STEP 2: DROP MODE COLUMNS
ALTER TABLE superjournal DROP COLUMN IF EXISTS mode;
ALTER TABLE journal DROP COLUMN IF EXISTS mode;
ALTER TABLE content DROP COLUMN IF EXISTS mode;
ALTER TABLE personas DROP COLUMN IF EXISTS mode;

-- STEP 3: SIMPLIFY USER_SETTINGS
ALTER TABLE user_settings
  DROP COLUMN IF EXISTS selected_persona_chat,
  DROP COLUMN IF EXISTS selected_persona_reader,
  DROP COLUMN IF EXISTS selected_persona_todo,
  DROP COLUMN IF EXISTS selected_chat_model,
  DROP COLUMN IF EXISTS selected_reader_model,
  DROP COLUMN IF EXISTS selected_work_model,
  DROP COLUMN IF EXISTS reading_timer_minutes;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS selected_persona TEXT DEFAULT 'gunnar',
  ADD COLUMN IF NOT EXISTS default_model TEXT DEFAULT 'claude-haiku-4-5-20251001';

-- STEP 4: CREATE MODEL_OVERRIDES TABLE
CREATE TABLE IF NOT EXISTS model_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  persona TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, persona)
);

ALTER TABLE model_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'model_overrides' AND policyname = 'Users can view their own model overrides') THEN
    CREATE POLICY "Users can view their own model overrides" ON model_overrides FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'model_overrides' AND policyname = 'Users can insert their own model overrides') THEN
    CREATE POLICY "Users can insert their own model overrides" ON model_overrides FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'model_overrides' AND policyname = 'Users can update their own model overrides') THEN
    CREATE POLICY "Users can update their own model overrides" ON model_overrides FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'model_overrides' AND policyname = 'Users can delete their own model overrides') THEN
    CREATE POLICY "Users can delete their own model overrides" ON model_overrides FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
