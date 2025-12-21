-- Add missing UPDATE policy for tags table
-- Required for rename_tag tool to work

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tags' AND policyname = 'Users can update own tags') THEN
    CREATE POLICY "Users can update own tags" ON tags FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
