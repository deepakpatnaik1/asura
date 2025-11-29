-- Create files table for chat mode file paste feature
-- Stores pasted HTML/text content with AI-generated artisan cuts for context injection

CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  raw_content TEXT NOT NULL,           -- Original pasted HTML/text
  artisan_cut TEXT NOT NULL,           -- AI-generated compression
  is_enabled BOOLEAN DEFAULT false,    -- Context injection toggle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_enabled ON files(user_id, is_enabled) WHERE is_enabled = true;
CREATE INDEX idx_files_created_at ON files(created_at DESC);

-- Enable Row-Level Security
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own files" ON files
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert own files" ON files
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own files" ON files
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own files" ON files
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER files_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION update_files_updated_at();

-- Comments
COMMENT ON TABLE files IS 'Stores pasted file content with AI-compressed artisan cuts for chat mode context injection.';
COMMENT ON COLUMN files.artisan_cut IS 'AI-generated compression of raw_content using Artisan Cut prompt';
COMMENT ON COLUMN files.is_enabled IS 'When true, artisan_cut is injected into Call 1 context';
