-- Create article_chat_charts table for LLM-generated tables in reader Q&A
-- Mirrors superjournal_charts pattern but keyed by article_chat message ID

CREATE TABLE article_chat_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_chat_id UUID NOT NULL REFERENCES article_chat(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_index INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  alt_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(article_chat_id, chart_index)
);

-- Indexes for performance
CREATE INDEX idx_article_chat_charts_article_chat_id ON article_chat_charts(article_chat_id);
CREATE INDEX idx_article_chat_charts_user_id ON article_chat_charts(user_id);

-- Enable Row-Level Security
ALTER TABLE article_chat_charts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own article chat charts" ON article_chat_charts
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert own article chat charts" ON article_chat_charts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own article chat charts" ON article_chat_charts
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE article_chat_charts IS 'Stores SVG tables extracted from Samara AI responses in reader Q&A mode.';
