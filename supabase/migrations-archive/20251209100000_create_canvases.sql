-- Canvases for Eva's character design workspace
-- Separate from Gunnar's whiteboards but same underlying schema
CREATE TABLE IF NOT EXISTS canvases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  state JSONB NOT NULL DEFAULT '{"render":[],"semantic":{},"viewport":{"x":0,"y":0,"scale":1}}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE canvases ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'canvases' AND policyname = 'Users can view own canvases') THEN
    CREATE POLICY "Users can view own canvases" ON canvases FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'canvases' AND policyname = 'Users can insert own canvases') THEN
    CREATE POLICY "Users can insert own canvases" ON canvases FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'canvases' AND policyname = 'Users can update own canvases') THEN
    CREATE POLICY "Users can update own canvases" ON canvases FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'canvases' AND policyname = 'Users can delete own canvases') THEN
    CREATE POLICY "Users can delete own canvases" ON canvases FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS canvases_user_id ON canvases(user_id);
CREATE INDEX IF NOT EXISTS canvases_updated_at ON canvases(user_id, updated_at DESC);
