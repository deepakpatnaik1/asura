-- Founder Diary (curated emotional wins, not task completion)
CREATE TABLE IF NOT EXISTS founder_diary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  description TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  source_message_id UUID REFERENCES superjournal(id) ON DELETE SET NULL
);

ALTER TABLE founder_diary ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'founder_diary' AND policyname = 'Users can view own diary') THEN
    CREATE POLICY "Users can view own diary" ON founder_diary FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'founder_diary' AND policyname = 'Users can insert own diary') THEN
    CREATE POLICY "Users can insert own diary" ON founder_diary FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'founder_diary' AND policyname = 'Users can update own diary') THEN
    CREATE POLICY "Users can update own diary" ON founder_diary FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'founder_diary' AND policyname = 'Users can delete own diary') THEN
    CREATE POLICY "Users can delete own diary" ON founder_diary FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS founder_diary_user_logged ON founder_diary(user_id, logged_at DESC);
