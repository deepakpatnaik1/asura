-- Create superjournal_charts table for LLM-generated tables in chat mode
-- Mirrors article_charts structure; stores SVG renders of markdown tables

CREATE TABLE superjournal_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  superjournal_id UUID NOT NULL REFERENCES superjournal(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_index INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  alt_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(superjournal_id, chart_index)
);

-- Indexes
CREATE INDEX idx_superjournal_charts_superjournal_id ON superjournal_charts(superjournal_id);
CREATE INDEX idx_superjournal_charts_user_id ON superjournal_charts(user_id);

-- Enable RLS
ALTER TABLE superjournal_charts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own charts" ON superjournal_charts
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert own charts" ON superjournal_charts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own charts" ON superjournal_charts
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE superjournal_charts IS 'Stores SVG renders of markdown tables extracted from AI responses in chat mode.';
