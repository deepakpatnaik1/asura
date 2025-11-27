-- ============================================================================
-- BASELINE MIGRATION: Asura Database Schema
-- ============================================================================
-- Generated: 2025-11-27
-- This migration consolidates 40 incremental migrations into a single baseline.
--
-- IMPORTANT: This migration is for NEW databases only.
-- Do NOT apply to existing databases that already have the schema.
--
-- To use for fresh deployment:
-- 1. Delete all migrations in supabase/migrations/ except this file
-- 2. Run: supabase db push (or supabase db reset for local)
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- TABLE: superjournal
-- Full, uncompressed conversation turns (Chat mode working memory)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.superjournal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    persona_name TEXT NOT NULL,
    user_message TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    model_identifier TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_starred BOOLEAN NOT NULL DEFAULT false
);

COMMENT ON TABLE public.superjournal IS 'Full, uncompressed conversation turns. Used as working memory (last 5 turns) in Chat mode.';
COMMENT ON COLUMN public.superjournal.model_identifier IS 'Model identifier that generated this AI response (e.g., claude-sonnet-4-5-20250929)';

CREATE INDEX idx_superjournal_user_id ON public.superjournal(user_id);
CREATE INDEX idx_superjournal_created_at ON public.superjournal(created_at DESC);
CREATE INDEX idx_superjournal_is_starred ON public.superjournal(is_starred) WHERE is_starred = true;

-- ============================================================================
-- TABLE: journal
-- Compressed conversation turns with embeddings for semantic search
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    superjournal_id UUID REFERENCES public.superjournal(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    persona_name TEXT NOT NULL,
    boss_essence TEXT NOT NULL,
    persona_essence TEXT NOT NULL,
    decision_arc_summary TEXT NOT NULL,
    salience_score INTEGER NOT NULL CHECK (salience_score >= 1 AND salience_score <= 10),
    is_starred BOOLEAN NOT NULL DEFAULT false,
    is_instruction BOOLEAN NOT NULL DEFAULT false,
    instruction_scope TEXT,
    file_name TEXT,
    file_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    embedding vector(1024)
);

COMMENT ON TABLE public.journal IS 'Artisan Cut compressed turns. Used for semantic search and long-term memory retrieval.';
COMMENT ON COLUMN public.journal.boss_essence IS 'Compressed user message (the Boss request/question)';
COMMENT ON COLUMN public.journal.persona_essence IS 'Compressed AI response essence';
COMMENT ON COLUMN public.journal.decision_arc_summary IS 'Summary of the decision/reasoning arc';
COMMENT ON COLUMN public.journal.salience_score IS 'Importance score 1-10 for memory prioritization';
COMMENT ON COLUMN public.journal.is_instruction IS 'Flags behavioral directives that persist indefinitely in context';
COMMENT ON COLUMN public.journal.instruction_scope IS 'Scope: global, gunnar, kirby, or NULL';
COMMENT ON COLUMN public.journal.embedding IS '1024-dimensional vector from Voyage AI for semantic search';

CREATE INDEX idx_journal_user_id ON public.journal(user_id);
CREATE INDEX idx_journal_created_at ON public.journal(created_at DESC);
CREATE INDEX idx_journal_is_starred ON public.journal(is_starred) WHERE is_starred = true;
CREATE INDEX idx_journal_salience_score ON public.journal(salience_score DESC);
CREATE INDEX idx_journal_superjournal_id ON public.journal(superjournal_id);
CREATE INDEX idx_journal_embedding ON public.journal USING hnsw (embedding vector_cosine_ops);
CREATE INDEX journal_instruction_scope_idx ON public.journal(is_instruction, instruction_scope) WHERE is_instruction = true;

-- ============================================================================
-- TABLE: models
-- LLM model catalog (read-only for users)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name TEXT NOT NULL,
    model_identifier TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'anthropic',
    model_type TEXT NOT NULL DEFAULT 'text_generation' CHECK (model_type IN ('text_generation', 'embedding')),
    context_window INTEGER NOT NULL,
    max_output_tokens INTEGER,
    input_price_per_million DECIMAL(10,4) DEFAULT 0.00,
    output_price_per_million DECIMAL(10,4) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.models IS 'LLM model catalog. Read-only for users, admin-only modifications via service role.';
COMMENT ON COLUMN public.models.model_type IS 'Model category: text_generation (chat/compression) or embedding (vectors)';
COMMENT ON COLUMN public.models.provider IS 'Model provider: anthropic, fireworks, voyage';

-- ============================================================================
-- TABLE: model_parameters
-- Per-use-case model parameters
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.model_parameters (
    model_identifier TEXT NOT NULL REFERENCES public.models(model_identifier) ON DELETE CASCADE,
    use_case TEXT NOT NULL CHECK (use_case IN ('conversation', 'compression', 'reader')),
    temperature DECIMAL(3,2) NOT NULL CHECK (temperature >= 0.0 AND temperature <= 1.0),
    max_tokens INTEGER NOT NULL CHECK (max_tokens > 0),
    thinking_enabled BOOLEAN NOT NULL DEFAULT false,
    max_tokens_thinking INTEGER CHECK (max_tokens_thinking IS NULL OR max_tokens_thinking > 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (model_identifier, use_case)
);

COMMENT ON TABLE public.model_parameters IS 'Use-case-specific parameters for LLM models';
COMMENT ON COLUMN public.model_parameters.use_case IS 'conversation (Call 1A/1B), compression (Call 2A/2B/3A/3B), or reader (article processing)';
COMMENT ON COLUMN public.model_parameters.temperature IS 'Temperature for this model in this use case (0.0-1.0)';
COMMENT ON COLUMN public.model_parameters.thinking_enabled IS 'Whether extended thinking is enabled for this use case';

-- ============================================================================
-- TABLE: user_settings
-- User preferences and configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    selected_persona TEXT NOT NULL DEFAULT 'gunnar' CHECK (selected_persona IN ('gunnar', 'kirby')),
    selected_conversation_model TEXT NOT NULL REFERENCES public.models(model_identifier) ON DELETE RESTRICT,
    selected_compression_model TEXT NOT NULL REFERENCES public.models(model_identifier) ON DELETE RESTRICT,
    selected_embedding_model TEXT NOT NULL REFERENCES public.models(model_identifier) ON DELETE RESTRICT,
    selected_reader_model TEXT NOT NULL REFERENCES public.models(model_identifier) ON DELETE RESTRICT,
    active_reader_article_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.user_settings IS 'User preferences and selected models';
COMMENT ON COLUMN public.user_settings.selected_persona IS 'Current persona (gunnar or kirby)';
COMMENT ON COLUMN public.user_settings.selected_conversation_model IS 'Model used for Call 1A, 1B (chat responses)';
COMMENT ON COLUMN public.user_settings.selected_compression_model IS 'Model used for Call 2A, 2B, 3A, 3B (compression and file processing)';
COMMENT ON COLUMN public.user_settings.selected_embedding_model IS 'Model used for generating embeddings (journal, file chunks)';
COMMENT ON COLUMN public.user_settings.selected_reader_model IS 'Model used for e-reader article processing and summarization';
COMMENT ON COLUMN public.user_settings.active_reader_article_id IS 'Currently active article in the e-reader (persisted across sessions)';

CREATE INDEX idx_user_settings_user_id ON public.user_settings(user_id);

-- ============================================================================
-- TABLE: user_roles
-- Admin role management
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_roles IS 'Admin role assignments. Used for RLS policy bypass.';

CREATE INDEX idx_user_roles_is_admin ON public.user_roles(is_admin) WHERE is_admin = true;

-- ============================================================================
-- TABLE: token_usage
-- API cost tracking per conversation
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.superjournal(id) ON DELETE CASCADE,
    model_identifier TEXT NOT NULL,
    total_input_tokens INTEGER NOT NULL DEFAULT 0,
    total_output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.token_usage IS 'Tracks API token usage and costs per conversation. Append-only for audit trail.';

CREATE INDEX idx_token_usage_user_id ON public.token_usage(user_id);
CREATE INDEX idx_token_usage_created_at ON public.token_usage(created_at);
CREATE INDEX idx_token_usage_user_created ON public.token_usage(user_id, created_at DESC);

-- ============================================================================
-- TABLE: articles
-- E-reader articles (pasted HTML content)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    raw_html TEXT,
    transformed_content TEXT,
    preview_snippet TEXT,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.articles IS 'E-reader articles. Stores original HTML and AI-generated summary.';
COMMENT ON COLUMN public.articles.raw_html IS 'Original HTML content pasted by user. Used directly for AI processing.';
COMMENT ON COLUMN public.articles.transformed_content IS 'AI-generated summary/analysis of the article';
COMMENT ON COLUMN public.articles.preview_snippet IS 'First 150 chars of transformed_content for list display';
COMMENT ON COLUMN public.articles.status IS 'processing = being analyzed, ready = summary available, error = processing failed';

CREATE INDEX idx_articles_user_id ON public.articles(user_id);
CREATE INDEX idx_articles_status ON public.articles(status);
CREATE INDEX idx_articles_created_at ON public.articles(created_at DESC);

-- Add foreign key for active_reader_article_id after articles table exists
ALTER TABLE public.user_settings
    ADD CONSTRAINT fk_active_reader_article
    FOREIGN KEY (active_reader_article_id) REFERENCES public.articles(id) ON DELETE SET NULL;

-- ============================================================================
-- TABLE: article_charts
-- Extracted chart/image metadata from articles
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.article_charts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chart_index INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    anthropic_file_id TEXT,
    anthropic_file_created_at TIMESTAMPTZ,
    alt_text TEXT DEFAULT '',
    is_relevant BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(article_id, chart_index)
);

COMMENT ON TABLE public.article_charts IS 'Stores metadata for individual chart/image files extracted from articles. Used for canvas carousel display with AI-powered ad filtering.';
COMMENT ON COLUMN public.article_charts.chart_index IS 'Sequential numbering (1, 2, 3...) within the article';
COMMENT ON COLUMN public.article_charts.storage_path IS 'Supabase storage path: article-images/{user_id}/{article_id}/chart-{index}.png';
COMMENT ON COLUMN public.article_charts.alt_text IS 'Alt text from original <img> tag. Used for programmatic filtering.';
COMMENT ON COLUMN public.article_charts.is_relevant IS 'AI filtering result: true = relevant chart/diagram, false = ad/irrelevant image';

CREATE INDEX idx_article_charts_article_id ON public.article_charts(article_id);
CREATE INDEX idx_article_charts_user_id ON public.article_charts(user_id);
CREATE INDEX idx_article_charts_alt_text ON public.article_charts USING gin(to_tsvector('english', alt_text));

-- ============================================================================
-- TABLE: article_chat
-- Q&A history for articles
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.article_chat (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.article_chat IS 'Q&A conversation history for articles in the e-reader.';

CREATE INDEX idx_article_chat_article_id ON public.article_chat(article_id);
CREATE INDEX idx_article_chat_user_id ON public.article_chat(user_id);
CREATE INDEX idx_article_chat_created_at ON public.article_chat(created_at DESC);

-- ============================================================================
-- TABLE: files (DEPRECATED - kept for reference)
-- Uploaded file metadata (file upload feature removed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    content_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.files IS 'DEPRECATED: File upload feature removed. Table retained for historical data.';

CREATE INDEX idx_files_user_id ON public.files(user_id);

-- ============================================================================
-- TABLE: file_chunks (DEPRECATED - kept for reference)
-- File chunks with embeddings for semantic search
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.file_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1024),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.file_chunks IS 'DEPRECATED: File upload feature removed. Table retained for historical data.';

CREATE INDEX idx_file_chunks_file_id ON public.file_chunks(file_id);
CREATE INDEX idx_file_chunks_embedding ON public.file_chunks USING hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Admin check helper function
CREATE OR REPLACE FUNCTION is_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS(
        SELECT 1 FROM user_roles
        WHERE user_roles.user_id = check_user_id AND is_admin = true
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_admin IS 'Checks if a user has admin role. Used in RLS policies for admin bypass.';

-- Vector similarity search for journal entries
CREATE OR REPLACE FUNCTION search_journal_by_embedding(
    query_embedding TEXT,
    match_count INT DEFAULT 50,
    exclude_ids UUID[] DEFAULT '{}',
    user_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    boss_essence TEXT,
    persona_essence TEXT,
    decision_arc_summary TEXT,
    salience_score INT,
    created_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        j.id,
        j.boss_essence,
        j.persona_essence,
        j.decision_arc_summary,
        j.salience_score,
        j.created_at,
        1 - (j.embedding <=> query_embedding::vector) AS similarity
    FROM journal j
    WHERE j.embedding IS NOT NULL
        AND j.is_instruction = false
        AND NOT (j.id = ANY(exclude_ids))
        AND (user_id_filter IS NULL OR j.user_id = user_id_filter)
    ORDER BY j.embedding <=> query_embedding::vector
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION search_journal_by_embedding IS 'Semantic search over journal entries. Returns most similar entries based on embedding cosine distance.';

-- Vector similarity search for file chunks (DEPRECATED)
CREATE OR REPLACE FUNCTION search_file_chunks(
    query_embedding TEXT,
    match_count INT DEFAULT 10,
    user_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    file_id UUID,
    file_name TEXT,
    chunk_index INT,
    content TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        fc.id,
        fc.file_id,
        f.file_name,
        fc.chunk_index,
        fc.content,
        1 - (fc.embedding <=> query_embedding::vector) AS similarity
    FROM file_chunks fc
    INNER JOIN files f ON fc.file_id = f.id
    WHERE fc.embedding IS NOT NULL
        AND (user_id_filter IS NULL OR f.user_id = user_id_filter)
    ORDER BY fc.embedding <=> query_embedding::vector
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION search_file_chunks IS 'DEPRECATED: File upload feature removed. Function retained for compatibility.';

-- Atomic nuke function for user data deletion
CREATE OR REPLACE FUNCTION nuke_user_data(target_user_id UUID)
RETURNS void AS $$
BEGIN
    -- Delete in dependency order (children before parents)
    -- Note: CASCADE handles most, but explicit order ensures clarity
    DELETE FROM article_chat WHERE user_id = target_user_id;
    DELETE FROM article_charts WHERE user_id = target_user_id;
    DELETE FROM articles WHERE user_id = target_user_id;
    DELETE FROM token_usage WHERE user_id = target_user_id;
    DELETE FROM journal WHERE user_id = target_user_id;
    DELETE FROM superjournal WHERE user_id = target_user_id;
    DELETE FROM user_settings WHERE user_id = target_user_id;
    -- Note: user_roles intentionally NOT deleted (admin status preserved)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION nuke_user_data IS 'Deletes all user data except admin role. Used by /api/nuke endpoint.';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.superjournal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_chunks ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: superjournal
-- ============================================================================

CREATE POLICY "Users can view their own superjournal entries" ON public.superjournal
    FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert their own superjournal entries" ON public.superjournal
    FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can update their own superjournal entries" ON public.superjournal
    FOR UPDATE USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can delete their own superjournal entries" ON public.superjournal
    FOR DELETE USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- ============================================================================
-- RLS POLICIES: journal
-- ============================================================================

CREATE POLICY "Users can view own journal entries" ON public.journal
    FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert own journal entries" ON public.journal
    FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can update own journal entries" ON public.journal
    FOR UPDATE USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can delete own journal entries" ON public.journal
    FOR DELETE USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- ============================================================================
-- RLS POLICIES: models (read-only catalog)
-- ============================================================================

CREATE POLICY "Authenticated users can view models" ON public.models
    FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================================
-- RLS POLICIES: model_parameters (read-only catalog)
-- ============================================================================

CREATE POLICY "Authenticated users can view model parameters" ON public.model_parameters
    FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================================
-- RLS POLICIES: user_settings
-- ============================================================================

CREATE POLICY "Users can view own settings" ON public.user_settings
    FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert own settings" ON public.user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can update own settings" ON public.user_settings
    FOR UPDATE USING (auth.uid() = user_id OR is_admin(auth.uid()))
    WITH CHECK (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can delete own settings" ON public.user_settings
    FOR DELETE USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- ============================================================================
-- RLS POLICIES: user_roles
-- ============================================================================

CREATE POLICY "Users can view own role" ON public.user_roles
    FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: token_usage
-- ============================================================================

CREATE POLICY "Users can view own token usage" ON public.token_usage
    FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert own token usage" ON public.token_usage
    FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin(auth.uid()));

-- ============================================================================
-- RLS POLICIES: articles
-- ============================================================================

CREATE POLICY "Users can view own articles" ON public.articles
    FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert own articles" ON public.articles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own articles" ON public.articles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own articles" ON public.articles
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: article_charts
-- ============================================================================

CREATE POLICY "Users can view own charts" ON public.article_charts
    FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert own charts" ON public.article_charts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own charts" ON public.article_charts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own charts" ON public.article_charts
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: article_chat
-- ============================================================================

CREATE POLICY "Users can view own chat" ON public.article_chat
    FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert own chat" ON public.article_chat
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat" ON public.article_chat
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat" ON public.article_chat
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: files (DEPRECATED)
-- ============================================================================

CREATE POLICY "Users can view own files" ON public.files
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own files" ON public.files
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own files" ON public.files
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: file_chunks (DEPRECATED - inherited via files)
-- ============================================================================

-- file_chunks access is controlled via files foreign key
-- No direct user_id check needed

-- ============================================================================
-- REALTIME
-- ============================================================================

-- Enable realtime for superjournal (live message updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.superjournal;
ALTER TABLE public.superjournal REPLICA IDENTITY FULL;

-- ============================================================================
-- SEED DATA: Models
-- ============================================================================

-- Claude Sonnet 4.5
INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, input_price_per_million, output_price_per_million)
VALUES ('Claude Sonnet 4.5', 'claude-sonnet-4-5-20250929', 'anthropic', 'text_generation', 200000, 3.00, 15.00)
ON CONFLICT (model_identifier) DO NOTHING;

-- Claude Haiku 4.5
INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, input_price_per_million, output_price_per_million)
VALUES ('Claude Haiku 4.5', 'claude-haiku-4-5', 'anthropic', 'text_generation', 200000, 0.80, 4.00)
ON CONFLICT (model_identifier) DO NOTHING;

-- Voyage 3 (Embedding)
INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, input_price_per_million, output_price_per_million)
VALUES ('Voyage 3', 'voyage-3', 'voyage', 'embedding', 32000, 0.06, 0.00)
ON CONFLICT (model_identifier) DO NOTHING;

-- ============================================================================
-- SEED DATA: Model Parameters
-- ============================================================================

-- Sonnet 4.5 - Conversation
INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled)
VALUES ('claude-sonnet-4-5-20250929', 'conversation', 0.7, 4096, false)
ON CONFLICT (model_identifier, use_case) DO NOTHING;

-- Sonnet 4.5 - Compression
INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled)
VALUES ('claude-sonnet-4-5-20250929', 'compression', 0.3, 2048, false)
ON CONFLICT (model_identifier, use_case) DO NOTHING;

-- Sonnet 4.5 - Reader
INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled)
VALUES ('claude-sonnet-4-5-20250929', 'reader', 0.7, 4096, false)
ON CONFLICT (model_identifier, use_case) DO NOTHING;

-- Haiku 4.5 - Conversation
INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled)
VALUES ('claude-haiku-4-5', 'conversation', 0.7, 4096, false)
ON CONFLICT (model_identifier, use_case) DO NOTHING;

-- Haiku 4.5 - Compression
INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled)
VALUES ('claude-haiku-4-5', 'compression', 0.3, 2048, false)
ON CONFLICT (model_identifier, use_case) DO NOTHING;

-- Haiku 4.5 - Reader
INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled)
VALUES ('claude-haiku-4-5', 'reader', 0.7, 4096, false)
ON CONFLICT (model_identifier, use_case) DO NOTHING;

-- ============================================================================
-- END OF BASELINE MIGRATION
-- ============================================================================
