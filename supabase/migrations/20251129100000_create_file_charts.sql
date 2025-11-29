-- Create file_charts table for chat mode file image extraction
-- Stores images and tables extracted from pasted HTML files

CREATE TABLE file_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_index INT NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  alt_text TEXT,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_file_charts_file_id ON file_charts(file_id);
CREATE INDEX idx_file_charts_user_id ON file_charts(user_id);

-- Enable Row-Level Security
ALTER TABLE file_charts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own file charts" ON file_charts
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert own file charts" ON file_charts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own file charts" ON file_charts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own file charts" ON file_charts
  FOR DELETE USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE file_charts IS 'Stores images and tables extracted from pasted HTML files in chat mode.';
COMMENT ON COLUMN file_charts.storage_path IS 'Path in files bucket: file-images/{userId}/{fileId}/chart-{n}.ext';
COMMENT ON COLUMN file_charts.thumbnail_path IS 'Path in files bucket: file-thumbnails/{userId}/{fileId}/chart-{n}.jpg';
COMMENT ON COLUMN file_charts.is_pinned IS 'Pinned charts appear first in carousel';
