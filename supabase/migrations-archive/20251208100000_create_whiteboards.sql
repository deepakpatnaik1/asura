-- Whiteboards for visual brainstorming with Gunnar
CREATE TABLE IF NOT EXISTS whiteboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  state JSONB NOT NULL DEFAULT '{"notes":[],"viewport":{"x":0,"y":0,"scale":1}}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whiteboards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whiteboards' AND policyname = 'Users can view own whiteboards') THEN
    CREATE POLICY "Users can view own whiteboards" ON whiteboards FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whiteboards' AND policyname = 'Users can insert own whiteboards') THEN
    CREATE POLICY "Users can insert own whiteboards" ON whiteboards FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whiteboards' AND policyname = 'Users can update own whiteboards') THEN
    CREATE POLICY "Users can update own whiteboards" ON whiteboards FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whiteboards' AND policyname = 'Users can delete own whiteboards') THEN
    CREATE POLICY "Users can delete own whiteboards" ON whiteboards FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS whiteboards_user_id ON whiteboards(user_id);
CREATE INDEX IF NOT EXISTS whiteboards_updated_at ON whiteboards(user_id, updated_at DESC);
