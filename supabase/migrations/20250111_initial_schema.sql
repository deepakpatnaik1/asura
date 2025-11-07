-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Create superjournal table (full conversation turns)
CREATE TABLE IF NOT EXISTS public.superjournal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_name TEXT NOT NULL,
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  is_starred BOOLEAN DEFAULT false,
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.superjournal ENABLE ROW LEVEL SECURITY;

-- Superjournal policies (shared business context, private personal journals)
CREATE POLICY "Users can view own and shared superjournal entries"
  ON public.superjournal FOR SELECT
  USING (
    auth.uid() = user_id
    OR (is_private = false AND persona_name != 'samara')
  );

CREATE POLICY "Users can insert own superjournal entries"
  ON public.superjournal FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own superjournal entries"
  ON public.superjournal FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own superjournal entries"
  ON public.superjournal FOR DELETE
  USING (auth.uid() = user_id);

-- Create journal table (compressed turns)
CREATE TABLE IF NOT EXISTS public.journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  superjournal_id UUID REFERENCES public.superjournal(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_name TEXT NOT NULL,
  boss_essence TEXT NOT NULL,
  persona_essence TEXT NOT NULL,
  decision_arc_summary TEXT NOT NULL,
  salience_score INTEGER NOT NULL CHECK (salience_score >= 1 AND salience_score <= 10),
  is_starred BOOLEAN DEFAULT false,
  is_private BOOLEAN DEFAULT false,
  file_name TEXT,
  file_type TEXT,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.journal ENABLE ROW LEVEL SECURITY;

-- Journal policies (shared business context, private personal journals)
CREATE POLICY "Users can view own and shared journal entries"
  ON public.journal FOR SELECT
  USING (
    auth.uid() = user_id
    OR (is_private = false AND persona_name != 'samara')
  );

CREATE POLICY "Users can insert own journal entries"
  ON public.journal FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own journal entries"
  ON public.journal FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own journal entries"
  ON public.journal FOR DELETE
  USING (auth.uid() = user_id);

-- Create index on embeddings for vector similarity search
CREATE INDEX IF NOT EXISTS journal_embedding_idx
  ON public.journal
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Create indices for performance
CREATE INDEX IF NOT EXISTS superjournal_user_id_idx ON public.superjournal(user_id);
CREATE INDEX IF NOT EXISTS superjournal_created_at_idx ON public.superjournal(created_at DESC);
CREATE INDEX IF NOT EXISTS superjournal_persona_name_idx ON public.superjournal(persona_name);
CREATE INDEX IF NOT EXISTS superjournal_is_starred_idx ON public.superjournal(is_starred) WHERE is_starred = true;

CREATE INDEX IF NOT EXISTS journal_user_id_idx ON public.journal(user_id);
CREATE INDEX IF NOT EXISTS journal_created_at_idx ON public.journal(created_at DESC);
CREATE INDEX IF NOT EXISTS journal_persona_name_idx ON public.journal(persona_name);
CREATE INDEX IF NOT EXISTS journal_salience_score_idx ON public.journal(salience_score DESC);
CREATE INDEX IF NOT EXISTS journal_is_starred_idx ON public.journal(is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS journal_file_name_idx ON public.journal(file_name) WHERE file_name IS NOT NULL;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_superjournal_updated_at BEFORE UPDATE ON public.superjournal
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_journal_updated_at BEFORE UPDATE ON public.journal
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to search journal by semantic similarity
CREATE OR REPLACE FUNCTION search_journal_by_embedding(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  user_uuid UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  persona_name TEXT,
  boss_essence TEXT,
  persona_essence TEXT,
  decision_arc_summary TEXT,
  salience_score INTEGER,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.user_id,
    j.persona_name,
    j.boss_essence,
    j.persona_essence,
    j.decision_arc_summary,
    j.salience_score,
    1 - (j.embedding <=> query_embedding) AS similarity,
    j.created_at
  FROM public.journal j
  WHERE
    (user_uuid IS NULL OR j.user_id = user_uuid OR (j.is_private = false AND j.persona_name != 'samara'))
    AND 1 - (j.embedding <=> query_embedding) > match_threshold
  ORDER BY j.salience_score DESC, similarity DESC
  LIMIT match_count;
END;
$$;
