-- ============================================================================
-- BASELINE MIGRATION: Aether Database Schema
-- ============================================================================
-- Generated: 2025-12-21
-- Source: Dumped from working local Supabase instance
--
-- This migration creates all tables, functions, indexes, and RLS policies
-- for the Aether application from scratch.
--
-- IMPORTANT: This is for NEW databases only.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: get_monthly_token_usage(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_monthly_token_usage(p_user_id uuid) RETURNS TABLE(total_input bigint, total_output bigint, total_cost_usd numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(total_input_tokens), 0)::BIGINT as total_input,
    COALESCE(SUM(total_output_tokens), 0)::BIGINT as total_output,
    COALESCE(SUM(cost_usd), 0.00)::DECIMAL(10, 6) as total_cost_usd
  FROM token_usage
  WHERE user_id = p_user_id
    AND created_at >= date_trunc('month', CURRENT_DATE)
    AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';
END;
$$;


--
-- Name: FUNCTION get_monthly_token_usage(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_monthly_token_usage(p_user_id uuid) IS 'Aggregate token usage for current month by user';


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(check_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = check_user_id AND is_admin = true
  );
$$;


--
-- Name: FUNCTION is_admin(check_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_admin(check_user_id uuid) IS 'Checks if a user has admin role. Used in RLS policies for admin bypass.';


--
-- Name: nuke_all_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nuke_all_data() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Delete in dependency order (children before parents)
  -- Removed: file_chunks, files (file system deleted)
  DELETE FROM journal WHERE user_id IS NULL;
  DELETE FROM superjournal WHERE user_id IS NULL;
END;
$$;


--
-- Name: nuke_user_data(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nuke_user_data(target_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
$$;


--
-- Name: FUNCTION nuke_user_data(target_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.nuke_user_data(target_user_id uuid) IS 'Deletes all user data except admin role. Used by /api/nuke endpoint.';


--
-- Name: search_file_chunks(text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_file_chunks(query_embedding text, match_count integer DEFAULT 10, user_id_filter uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, file_id uuid, file_name text, chunk_index integer, content text, similarity double precision)
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


--
-- Name: FUNCTION search_file_chunks(query_embedding text, match_count integer, user_id_filter uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.search_file_chunks(query_embedding text, match_count integer, user_id_filter uuid) IS 'DEPRECATED: File upload feature removed. Function retained for compatibility.';


--
-- Name: search_file_chunks(public.vector, double precision, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_file_chunks(query_embedding public.vector, match_threshold double precision, match_count integer, user_id_filter uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, file_id uuid, chunk_index integer, chunk_text text, boss_essence text, persona_essence text, decision_arc_summary text, salience_score integer, similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    fc.id,
    fc.file_id,
    fc.chunk_index,
    fc.chunk_text,
    fc.boss_essence,
    fc.persona_essence,
    fc.decision_arc_summary,
    fc.salience_score,
    1 - (fc.embedding <=> query_embedding) AS similarity
  FROM file_chunks fc
  INNER JOIN files f ON fc.file_id = f.id
  WHERE fc.embedding <=> query_embedding < match_threshold
    AND (user_id_filter IS NULL OR f.user_id = user_id_filter)  -- Filter via files table
  ORDER BY fc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


--
-- Name: search_journal_by_embedding(text, integer, uuid[], uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_journal_by_embedding(query_embedding text, match_count integer DEFAULT 50, exclude_ids uuid[] DEFAULT '{}'::uuid[], user_id_filter uuid DEFAULT NULL::uuid, persona_name_filter text DEFAULT NULL::text) RETURNS TABLE(id uuid, boss_essence text, persona_essence text, decision_arc_summary text, salience_score integer, created_at timestamp with time zone, similarity double precision)
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
    AND NOT (j.id = ANY(exclude_ids))
    AND (user_id_filter IS NULL OR j.user_id = user_id_filter)
    AND (persona_name_filter IS NULL OR j.persona_name = persona_name_filter)
  ORDER BY j.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;


--
-- Name: FUNCTION search_journal_by_embedding(query_embedding text, match_count integer, exclude_ids uuid[], user_id_filter uuid, persona_name_filter text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.search_journal_by_embedding(query_embedding text, match_count integer, exclude_ids uuid[], user_id_filter uuid, persona_name_filter text) IS 'Semantic search over journal entries. Supports persona-only filtering via persona_name_filter parameter.';


--
-- Name: update_files_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_files_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;




--
-- Name: article_charts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_charts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_id uuid NOT NULL,
    user_id uuid NOT NULL,
    chart_index integer NOT NULL,
    storage_path text NOT NULL,
    thumbnail_path text,
    anthropic_file_id text,
    anthropic_file_created_at timestamp with time zone,
    alt_text text DEFAULT ''::text,
    is_relevant boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE article_charts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.article_charts IS 'Stores metadata for individual chart/image PDFs extracted from articles. Used for canvas carousel display with AI-powered ad filtering.';


--
-- Name: COLUMN article_charts.chart_index; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.article_charts.chart_index IS 'Sequential numbering (1, 2, 3...) within the article';


--
-- Name: COLUMN article_charts.storage_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.article_charts.storage_path IS 'Supabase storage path: article-images/{user_id}/{article_id}/chart-{index}.png';


--
-- Name: COLUMN article_charts.alt_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.article_charts.alt_text IS 'Alt text from original <img> tag. Used for programmatic filtering to identify ads/banners before AI pass.';


--
-- Name: COLUMN article_charts.is_relevant; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.article_charts.is_relevant IS 'AI filtering result: true = relevant chart/diagram, false = ad/irrelevant image';


--
-- Name: article_chat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_chat (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT article_chat_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: TABLE article_chat; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.article_chat IS 'Q&A conversation history for articles in the e-reader.';


--
-- Name: article_chat_charts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_chat_charts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_chat_id uuid NOT NULL,
    user_id uuid NOT NULL,
    chart_index integer NOT NULL,
    storage_path text NOT NULL,
    thumbnail_path text,
    alt_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE article_chat_charts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.article_chat_charts IS 'Stores SVG tables extracted from Samara AI responses in reader Q&A.';


--
-- Name: articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    raw_content text,
    artisan_cut text,
    is_enabled boolean DEFAULT true,
    is_canon boolean DEFAULT false
);


--
-- Name: TABLE articles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.articles IS 'E-reader articles. Stores original HTML and AI-generated summary.';


--
-- Name: canvas_design; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvas_design (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text DEFAULT 'Untitled'::text NOT NULL,
    state jsonb DEFAULT '{"render": [], "semantic": {}, "viewport": {"x": 0, "y": 0, "scale": 1}}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE canvas_design; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.canvas_design IS 'Eva design canvases for character work';


--
-- Name: canvas_designer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvas_designer (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text DEFAULT 'Untitled'::text NOT NULL,
    state jsonb DEFAULT '{"render": [], "semantic": {}, "viewport": {"x": 0, "y": 0, "scale": 1}}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_selected boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN canvas_designer.is_selected; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.canvas_designer.is_selected IS 'Whether this designer canvas is selected for context injection';


--
-- Name: canvas_planner_diary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvas_planner_diary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    description text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    logged_at timestamp with time zone DEFAULT now(),
    source_message_id uuid,
    event_period text,
    sort_date date
);


--
-- Name: TABLE canvas_planner_diary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.canvas_planner_diary IS 'Alicja planner - founder diary entries';


--
-- Name: canvas_planner_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvas_planner_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE canvas_planner_tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.canvas_planner_tags IS 'Alicja planner - tags for todos and diary';


--
-- Name: canvas_planner_todos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvas_planner_todos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    description text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    status text DEFAULT 'open'::text,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    scheduled_for date,
    times_pushed integer DEFAULT 0,
    google_event_id text,
    source_message_id uuid,
    deadline_period text,
    parent_id uuid,
    CONSTRAINT todos_status_check CHECK ((status = ANY (ARRAY['open'::text, 'completed'::text])))
);


--
-- Name: TABLE canvas_planner_todos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.canvas_planner_todos IS 'Alicja planner - todo items';


--
-- Name: canvas_whiteboard; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvas_whiteboard (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text DEFAULT 'Untitled'::text NOT NULL,
    state jsonb DEFAULT '{"render": [], "semantic": {}, "viewport": {"x": 0, "y": 0, "scale": 1}}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_selected boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE canvas_whiteboard; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.canvas_whiteboard IS 'Gunnar whiteboard canvases for strategy planning';


--
-- Name: COLUMN canvas_whiteboard.is_selected; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.canvas_whiteboard.is_selected IS 'Whether this whiteboard is selected for context injection';


--
-- Name: element_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.element_codes (
    code character(3) NOT NULL,
    canvas_id uuid NOT NULL,
    element_id uuid NOT NULL,
    storage_url text,
    created_at timestamp with time zone DEFAULT now(),
    caption text,
    element_type text DEFAULT 'image'::text NOT NULL
);


--
-- Name: COLUMN element_codes.caption; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.element_codes.caption IS 'Auto-generated description of the image from JoyCaption';


--
-- Name: file_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding public.vector(1024),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE file_chunks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.file_chunks IS 'DEPRECATED: File upload feature removed. Table retained for historical data.';


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_size integer NOT NULL,
    content_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE files; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.files IS 'Stores pasted file content with AI-compressed artisan cuts for context injection.';


--
-- Name: google_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: journal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    superjournal_id uuid,
    user_id uuid,
    persona_name text NOT NULL,
    boss_essence text NOT NULL,
    persona_essence text NOT NULL,
    decision_arc_summary text NOT NULL,
    salience_score integer NOT NULL,
    is_starred boolean DEFAULT false NOT NULL,
    file_name text,
    file_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    embedding public.vector(1024),
    CONSTRAINT journal_salience_score_check CHECK (((salience_score >= 1) AND (salience_score <= 10)))
);


--
-- Name: TABLE journal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.journal IS 'Artisan Cut compressed turns. Used for semantic search and long-term memory retrieval.';


--
-- Name: COLUMN journal.boss_essence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.journal.boss_essence IS 'Compressed user message (the Boss request/question)';


--
-- Name: COLUMN journal.persona_essence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.journal.persona_essence IS 'Compressed AI response essence';


--
-- Name: COLUMN journal.decision_arc_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.journal.decision_arc_summary IS 'Summary of the decision/reasoning arc';


--
-- Name: COLUMN journal.salience_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.journal.salience_score IS 'Importance score 1-10 for memory prioritization';


--
-- Name: COLUMN journal.embedding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.journal.embedding IS '1024-dimensional vector from Voyage AI (voyage-3 model) for semantic search. Cost: $0.06/M tokens.';


--
-- Name: model_parameters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_parameters (
    model_identifier text NOT NULL,
    use_case text NOT NULL,
    temperature numeric(3,2) NOT NULL,
    max_tokens integer NOT NULL,
    thinking_enabled boolean DEFAULT false NOT NULL,
    max_tokens_thinking integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT model_parameters_max_tokens_check CHECK ((max_tokens > 0)),
    CONSTRAINT model_parameters_max_tokens_thinking_check CHECK (((max_tokens_thinking IS NULL) OR (max_tokens_thinking > 0))),
    CONSTRAINT model_parameters_temperature_check CHECK (((temperature >= 0.0) AND (temperature <= 1.0))),
    CONSTRAINT model_parameters_use_case_check CHECK ((use_case = ANY (ARRAY['conversation'::text, 'compression'::text])))
);


--
-- Name: TABLE model_parameters; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.model_parameters IS 'Use-case-specific parameters for LLM models';


--
-- Name: COLUMN model_parameters.use_case; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_parameters.use_case IS 'conversation (Call 1A/1B) or compression (Call 2A/2B/3A/3B)';


--
-- Name: COLUMN model_parameters.temperature; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_parameters.temperature IS 'Temperature for this model in this use case (0.0-1.0)';


--
-- Name: COLUMN model_parameters.max_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_parameters.max_tokens IS 'Standard max tokens for this use case';


--
-- Name: COLUMN model_parameters.thinking_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_parameters.thinking_enabled IS 'Whether extended thinking is enabled for this use case';


--
-- Name: COLUMN model_parameters.max_tokens_thinking; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_parameters.max_tokens_thinking IS 'Max tokens when thinking enabled (nullable)';


--
-- Name: models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    model_name text NOT NULL,
    model_identifier text NOT NULL,
    provider text NOT NULL,
    model_type text DEFAULT 'text_generation'::text NOT NULL,
    context_window integer NOT NULL,
    max_output_tokens integer,
    input_price_per_million numeric(10,4) DEFAULT 0.00,
    output_price_per_million numeric(10,4) DEFAULT 0.00,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    cost_per_image numeric(10,4) DEFAULT 0.00,
    supports_tool_calling boolean DEFAULT false,
    CONSTRAINT models_model_type_check CHECK ((model_type = ANY (ARRAY['text_generation'::text, 'embedding'::text, 'image_generation'::text, 'captioning'::text, 'image_edit'::text, 'audio_generation'::text, 'audio_transcription'::text, 'video_generation'::text, 'tool_calling'::text])))
);


--
-- Name: TABLE models; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.models IS 'LLM model catalog. Read-only for users, admin-only modifications via service role.';


--
-- Name: COLUMN models.provider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.models.provider IS 'Model provider: anthropic, fireworks, voyage';


--
-- Name: COLUMN models.model_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.models.model_type IS 'Model category: text_generation (chat/compression) or embedding (vectors)';


--
-- Name: personas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    display_name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE personas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.personas IS 'AI personas available in the system';


--
-- Name: COLUMN personas.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.personas.name IS 'Lowercase identifier used in code';


--
-- Name: COLUMN personas.display_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.personas.display_name IS 'Human-readable name shown in UI';


--
-- Name: superjournal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.superjournal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    persona_name text NOT NULL,
    user_message text NOT NULL,
    ai_response text NOT NULL,
    model_identifier text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_starred boolean DEFAULT false NOT NULL,
    content_id uuid
);

ALTER TABLE ONLY public.superjournal REPLICA IDENTITY FULL;


--
-- Name: TABLE superjournal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.superjournal IS 'Full, uncompressed conversation turns. Used as working memory (last 5 turns).';


--
-- Name: COLUMN superjournal.model_identifier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.superjournal.model_identifier IS 'Model identifier that generated this AI response (e.g., claude-sonnet-4-5-20250929, accounts/fireworks/models/qwen3-235b-a22b)';


--
-- Name: superjournal_charts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.superjournal_charts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    superjournal_id uuid NOT NULL,
    user_id uuid NOT NULL,
    chart_index integer NOT NULL,
    storage_path text NOT NULL,
    thumbnail_path text,
    alt_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    is_dismissed boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE superjournal_charts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.superjournal_charts IS 'Stores SVG renders of markdown tables extracted from AI responses.';


--
-- Name: COLUMN superjournal_charts.is_pinned; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.superjournal_charts.is_pinned IS 'Pinned charts appear first in carousel and persist across sessions';


--
-- Name: COLUMN superjournal_charts.is_dismissed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.superjournal_charts.is_dismissed IS 'Dismissed charts are hidden from carousel (soft delete)';


--
-- Name: token_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    conversation_id uuid,
    model_identifier text NOT NULL,
    total_input_tokens integer DEFAULT 0 NOT NULL,
    total_output_tokens integer DEFAULT 0 NOT NULL,
    cost_usd numeric(10,6) DEFAULT 0.00 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE token_usage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.token_usage IS 'Tracks API token usage and costs per conversation. Append-only for audit trail.';


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE user_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_roles IS 'Admin role assignments. Used for RLS policy bypass.';


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    active_reader_article_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    selected_persona text DEFAULT 'gunnar'::text,
    default_model text DEFAULT 'claude-haiku-4-5-20251001'::text,
    last_backup_date date,
    model_gunnar text,
    model_kirby text,
    model_samara text,
    model_alicja text,
    model_eva text,
    model_ananya text,
    model_embeddings text,
    model_image_gen text,
    model_captioning text,
    model_image_edit text,
    model_audio_gen text,
    model_video_gen text,
    model_compression text,
    model_tool_calling text,
    model_chat_compression text DEFAULT 'claude-opus-4-5-20251101'::text,
    model_chat_compression_uncensored text DEFAULT 'nousresearch/hermes-3-llama-3.1-70b'::text,
    compression_uncensored_gunnar boolean DEFAULT false,
    compression_uncensored_kirby boolean DEFAULT false,
    compression_uncensored_samara boolean DEFAULT false,
    compression_uncensored_alicja boolean DEFAULT false,
    compression_uncensored_eva boolean DEFAULT true,
    compression_uncensored_ananya boolean DEFAULT false
);


--
-- Name: TABLE user_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_settings IS 'Global application settings (single-row, no user_id - single-user app)';


--
-- Name: COLUMN user_settings.active_reader_article_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_settings.active_reader_article_id IS 'Currently active article in the e-reader (persisted across sessions)';


--
-- Name: COLUMN user_settings.model_chat_compression_uncensored; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_settings.model_chat_compression_uncensored IS 'Model for compressing NSFW chat content (Eva persona)';


--
-- Name: COLUMN user_settings.compression_uncensored_eva; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_settings.compression_uncensored_eva IS 'Eva defaults to uncensored compression for NSFW content';


--
-- Name: article_charts article_charts_article_id_chart_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_charts
    ADD CONSTRAINT article_charts_article_id_chart_index_key UNIQUE (content_id, chart_index);


--
-- Name: article_charts article_charts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_charts
    ADD CONSTRAINT article_charts_pkey PRIMARY KEY (id);


--
-- Name: article_chat_charts article_chat_charts_article_chat_id_chart_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_chat_charts
    ADD CONSTRAINT article_chat_charts_article_chat_id_chart_index_key UNIQUE (article_chat_id, chart_index);


--
-- Name: article_chat_charts article_chat_charts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_chat_charts
    ADD CONSTRAINT article_chat_charts_pkey PRIMARY KEY (id);


--
-- Name: article_chat article_chat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_chat
    ADD CONSTRAINT article_chat_pkey PRIMARY KEY (id);


--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_pkey PRIMARY KEY (id);


--
-- Name: canvas_design canvas_design_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_design
    ADD CONSTRAINT canvas_design_pkey PRIMARY KEY (id);


--
-- Name: canvas_designer canvas_designer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_designer
    ADD CONSTRAINT canvas_designer_pkey PRIMARY KEY (id);


--
-- Name: canvas_whiteboard canvas_whiteboard_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_whiteboard
    ADD CONSTRAINT canvas_whiteboard_pkey PRIMARY KEY (id);


--
-- Name: file_chunks file_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_chunks
    ADD CONSTRAINT file_chunks_pkey PRIMARY KEY (id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: canvas_planner_diary founder_diary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_planner_diary
    ADD CONSTRAINT founder_diary_pkey PRIMARY KEY (id);


--
-- Name: google_tokens google_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_tokens
    ADD CONSTRAINT google_tokens_pkey PRIMARY KEY (id);


--
-- Name: google_tokens google_tokens_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_tokens
    ADD CONSTRAINT google_tokens_user_id_key UNIQUE (user_id);


--
-- Name: element_codes image_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.element_codes
    ADD CONSTRAINT image_codes_pkey PRIMARY KEY (code);


--
-- Name: journal journal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal
    ADD CONSTRAINT journal_pkey PRIMARY KEY (id);


--
-- Name: model_parameters model_parameters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_parameters
    ADD CONSTRAINT model_parameters_pkey PRIMARY KEY (model_identifier, use_case);


--
-- Name: models models_model_identifier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_model_identifier_key UNIQUE (model_identifier);


--
-- Name: models models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_pkey PRIMARY KEY (id);


--
-- Name: personas personas_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personas
    ADD CONSTRAINT personas_name_key UNIQUE (name);


--
-- Name: personas personas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personas
    ADD CONSTRAINT personas_pkey PRIMARY KEY (id);


--
-- Name: superjournal_charts superjournal_charts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superjournal_charts
    ADD CONSTRAINT superjournal_charts_pkey PRIMARY KEY (id);


--
-- Name: superjournal_charts superjournal_charts_superjournal_id_chart_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superjournal_charts
    ADD CONSTRAINT superjournal_charts_superjournal_id_chart_index_key UNIQUE (superjournal_id, chart_index);


--
-- Name: superjournal superjournal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superjournal
    ADD CONSTRAINT superjournal_pkey PRIMARY KEY (id);


--
-- Name: canvas_planner_tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_planner_tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: canvas_planner_tags tags_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_planner_tags
    ADD CONSTRAINT tags_user_id_name_key UNIQUE (user_id, name);


--
-- Name: canvas_planner_todos todos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_planner_todos
    ADD CONSTRAINT todos_pkey PRIMARY KEY (id);


--
-- Name: token_usage token_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_usage
    ADD CONSTRAINT token_usage_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);


--
-- Name: canvas_design_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canvas_design_updated_at ON public.canvas_design USING btree (user_id, updated_at DESC);


--
-- Name: canvas_design_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canvas_design_user_id ON public.canvas_design USING btree (user_id);


--
-- Name: canvas_designer_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canvas_designer_updated_at ON public.canvas_designer USING btree (user_id, updated_at DESC);


--
-- Name: canvas_designer_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canvas_designer_user_id ON public.canvas_designer USING btree (user_id);


--
-- Name: canvas_whiteboard_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canvas_whiteboard_updated_at ON public.canvas_whiteboard USING btree (user_id, updated_at DESC);


--
-- Name: canvas_whiteboard_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canvas_whiteboard_user_id ON public.canvas_whiteboard USING btree (user_id);


--
-- Name: founder_diary_user_logged; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX founder_diary_user_logged ON public.canvas_planner_diary USING btree (user_id, logged_at DESC);


--
-- Name: founder_diary_user_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX founder_diary_user_sort ON public.canvas_planner_diary USING btree (user_id, sort_date DESC);


--
-- Name: google_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX google_tokens_user_id ON public.google_tokens USING btree (user_id);


--
-- Name: idx_article_charts_alt_text; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_charts_alt_text ON public.article_charts USING gin (to_tsvector('english'::regconfig, alt_text));


--
-- Name: idx_article_charts_article_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_charts_article_id ON public.article_charts USING btree (content_id);


--
-- Name: idx_article_charts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_charts_user_id ON public.article_charts USING btree (user_id);


--
-- Name: idx_article_chat_article_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_chat_article_id ON public.article_chat USING btree (article_id);


--
-- Name: idx_article_chat_charts_article_chat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_chat_charts_article_chat_id ON public.article_chat_charts USING btree (article_chat_id);


--
-- Name: idx_article_chat_charts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_chat_charts_user_id ON public.article_chat_charts USING btree (user_id);


--
-- Name: idx_article_chat_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_chat_created_at ON public.article_chat USING btree (created_at DESC);


--
-- Name: idx_article_chat_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_chat_user_id ON public.article_chat USING btree (user_id);


--
-- Name: idx_articles_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_created_at ON public.articles USING btree (created_at DESC);


--
-- Name: idx_articles_is_canon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_is_canon ON public.articles USING btree (user_id, is_canon) WHERE (is_canon = true);


--
-- Name: idx_articles_is_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_is_enabled ON public.articles USING btree (user_id, is_enabled) WHERE (is_enabled = true);


--
-- Name: idx_articles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_user_id ON public.articles USING btree (user_id);


--
-- Name: idx_element_codes_canvas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_element_codes_canvas ON public.element_codes USING btree (canvas_id);


--
-- Name: idx_element_codes_element; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_element_codes_element ON public.element_codes USING btree (element_id);


--
-- Name: idx_file_chunks_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_chunks_embedding ON public.file_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_file_chunks_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_chunks_file_id ON public.file_chunks USING btree (file_id);


--
-- Name: idx_files_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_created_at ON public.files USING btree (created_at DESC);


--
-- Name: idx_files_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_user_id ON public.files USING btree (user_id);


--
-- Name: idx_journal_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_created_at ON public.journal USING btree (created_at DESC);


--
-- Name: idx_journal_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_embedding ON public.journal USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_journal_is_starred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_is_starred ON public.journal USING btree (is_starred) WHERE (is_starred = true);


--
-- Name: idx_journal_salience_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_salience_score ON public.journal USING btree (salience_score DESC);


--
-- Name: idx_journal_superjournal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_superjournal_id ON public.journal USING btree (superjournal_id);


--
-- Name: idx_journal_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_user_id ON public.journal USING btree (user_id);


--
-- Name: idx_superjournal_charts_not_dismissed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_superjournal_charts_not_dismissed ON public.superjournal_charts USING btree (user_id, is_dismissed) WHERE (is_dismissed = false);


--
-- Name: idx_superjournal_charts_superjournal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_superjournal_charts_superjournal_id ON public.superjournal_charts USING btree (superjournal_id);


--
-- Name: idx_superjournal_charts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_superjournal_charts_user_id ON public.superjournal_charts USING btree (user_id);


--
-- Name: idx_superjournal_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_superjournal_created_at ON public.superjournal USING btree (created_at DESC);


--
-- Name: idx_superjournal_is_starred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_superjournal_is_starred ON public.superjournal USING btree (is_starred) WHERE (is_starred = true);


--
-- Name: idx_superjournal_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_superjournal_user_id ON public.superjournal USING btree (user_id);


--
-- Name: idx_token_usage_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_usage_created_at ON public.token_usage USING btree (created_at);


--
-- Name: idx_token_usage_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_usage_user_created ON public.token_usage USING btree (user_id, created_at DESC);


--
-- Name: idx_token_usage_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_usage_user_id ON public.token_usage USING btree (user_id);


--
-- Name: idx_user_roles_is_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_is_admin ON public.user_roles USING btree (is_admin) WHERE (is_admin = true);


--
-- Name: idx_user_settings_singleton; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_settings_singleton ON public.user_settings USING btree ((1));


--
-- Name: idx_user_settings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_settings_user_id ON public.user_settings USING btree (user_id);


--
-- Name: tags_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tags_user_id ON public.canvas_planner_tags USING btree (user_id);


--
-- Name: todos_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX todos_parent_id ON public.canvas_planner_todos USING btree (parent_id) WHERE (parent_id IS NOT NULL);


--
-- Name: todos_user_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX todos_user_deadline ON public.canvas_planner_todos USING btree (user_id) WHERE (deadline_period IS NOT NULL);


--
-- Name: todos_user_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX todos_user_scheduled ON public.canvas_planner_todos USING btree (user_id, scheduled_for) WHERE (scheduled_for IS NOT NULL);


--
-- Name: todos_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX todos_user_status ON public.canvas_planner_todos USING btree (user_id, status);


--
-- Name: files files_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.update_files_updated_at();


--
-- Name: article_charts article_charts_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_charts
    ADD CONSTRAINT article_charts_article_id_fkey FOREIGN KEY (content_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: article_charts article_charts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_charts
    ADD CONSTRAINT article_charts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: article_chat article_chat_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_chat
    ADD CONSTRAINT article_chat_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: article_chat_charts article_chat_charts_article_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_chat_charts
    ADD CONSTRAINT article_chat_charts_article_chat_id_fkey FOREIGN KEY (article_chat_id) REFERENCES public.article_chat(id) ON DELETE CASCADE;


--
-- Name: article_chat_charts article_chat_charts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_chat_charts
    ADD CONSTRAINT article_chat_charts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: article_chat article_chat_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_chat
    ADD CONSTRAINT article_chat_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: articles articles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: canvas_design canvas_design_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_design
    ADD CONSTRAINT canvas_design_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: canvas_designer canvas_designer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_designer
    ADD CONSTRAINT canvas_designer_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: canvas_whiteboard canvas_whiteboard_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_whiteboard
    ADD CONSTRAINT canvas_whiteboard_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: file_chunks file_chunks_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_chunks
    ADD CONSTRAINT file_chunks_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: files files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_settings fk_active_reader_article; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT fk_active_reader_article FOREIGN KEY (active_reader_article_id) REFERENCES public.articles(id) ON DELETE SET NULL;


--
-- Name: canvas_planner_diary founder_diary_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_planner_diary
    ADD CONSTRAINT founder_diary_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.superjournal(id) ON DELETE SET NULL;


--
-- Name: canvas_planner_diary founder_diary_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_planner_diary
    ADD CONSTRAINT founder_diary_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: google_tokens google_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_tokens
    ADD CONSTRAINT google_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: element_codes image_codes_canvas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.element_codes
    ADD CONSTRAINT image_codes_canvas_id_fkey FOREIGN KEY (canvas_id) REFERENCES public.canvas_designer(id) ON DELETE CASCADE;


--
-- Name: journal journal_superjournal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal
    ADD CONSTRAINT journal_superjournal_id_fkey FOREIGN KEY (superjournal_id) REFERENCES public.superjournal(id) ON DELETE CASCADE;


--
-- Name: journal journal_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal
    ADD CONSTRAINT journal_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: model_parameters model_parameters_model_identifier_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_parameters
    ADD CONSTRAINT model_parameters_model_identifier_fkey FOREIGN KEY (model_identifier) REFERENCES public.models(model_identifier) ON DELETE CASCADE;


--
-- Name: superjournal_charts superjournal_charts_superjournal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superjournal_charts
    ADD CONSTRAINT superjournal_charts_superjournal_id_fkey FOREIGN KEY (superjournal_id) REFERENCES public.superjournal(id) ON DELETE CASCADE;


--
-- Name: superjournal_charts superjournal_charts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superjournal_charts
    ADD CONSTRAINT superjournal_charts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: superjournal superjournal_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superjournal
    ADD CONSTRAINT superjournal_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.articles(id) ON DELETE SET NULL;


--
-- Name: superjournal superjournal_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superjournal
    ADD CONSTRAINT superjournal_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: canvas_planner_tags tags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_planner_tags
    ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: canvas_planner_todos todos_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_planner_todos
    ADD CONSTRAINT todos_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.canvas_planner_todos(id) ON DELETE CASCADE;


--
-- Name: canvas_planner_todos todos_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_planner_todos
    ADD CONSTRAINT todos_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.superjournal(id) ON DELETE SET NULL;


--
-- Name: canvas_planner_todos todos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvas_planner_todos
    ADD CONSTRAINT todos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: token_usage token_usage_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_usage
    ADD CONSTRAINT token_usage_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.superjournal(id) ON DELETE SET NULL;


--
-- Name: token_usage token_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_usage
    ADD CONSTRAINT token_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: personas Anyone can read personas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read personas" ON public.personas FOR SELECT USING (true);


--
-- Name: model_parameters Authenticated users can view model parameters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view model parameters" ON public.model_parameters FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: models Authenticated users can view models; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view models" ON public.models FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: element_codes Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.element_codes USING ((auth.role() = 'service_role'::text));


--
-- Name: article_chat_charts Users can delete own article chat charts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own article chat charts" ON public.article_chat_charts FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: articles Users can delete own articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own articles" ON public.articles FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: article_charts Users can delete own charts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own charts" ON public.article_charts FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: superjournal_charts Users can delete own charts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own charts" ON public.superjournal_charts FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: article_chat Users can delete own chat; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own chat" ON public.article_chat FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: canvas_designer Users can delete own designer canvases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own designer canvases" ON public.canvas_designer FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: canvas_design Users can delete own designs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own designs" ON public.canvas_design FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: canvas_planner_diary Users can delete own diary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own diary" ON public.canvas_planner_diary FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: files Users can delete own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own files" ON public.files FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: journal Users can delete own journal entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own journal entries" ON public.journal FOR DELETE USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: user_settings Users can delete own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own settings" ON public.user_settings FOR DELETE USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: canvas_planner_tags Users can delete own tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own tags" ON public.canvas_planner_tags FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: canvas_planner_todos Users can delete own todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own todos" ON public.canvas_planner_todos FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: google_tokens Users can delete own tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own tokens" ON public.google_tokens FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: canvas_whiteboard Users can delete own whiteboards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own whiteboards" ON public.canvas_whiteboard FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: superjournal Users can delete their own superjournal entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own superjournal entries" ON public.superjournal FOR DELETE USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: article_chat_charts Users can insert own article chat charts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own article chat charts" ON public.article_chat_charts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: articles Users can insert own articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own articles" ON public.articles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: article_charts Users can insert own charts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own charts" ON public.article_charts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: superjournal_charts Users can insert own charts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own charts" ON public.superjournal_charts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: article_chat Users can insert own chat; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own chat" ON public.article_chat FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: canvas_designer Users can insert own designer canvases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own designer canvases" ON public.canvas_designer FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: canvas_design Users can insert own designs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own designs" ON public.canvas_design FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: canvas_planner_diary Users can insert own diary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own diary" ON public.canvas_planner_diary FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: files Users can insert own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own files" ON public.files FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: journal Users can insert own journal entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own journal entries" ON public.journal FOR INSERT WITH CHECK (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: user_settings Users can insert own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own settings" ON public.user_settings FOR INSERT WITH CHECK (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: canvas_planner_tags Users can insert own tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own tags" ON public.canvas_planner_tags FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: canvas_planner_todos Users can insert own todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own todos" ON public.canvas_planner_todos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: token_usage Users can insert own token usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own token usage" ON public.token_usage FOR INSERT WITH CHECK (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: google_tokens Users can insert own tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own tokens" ON public.google_tokens FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: canvas_whiteboard Users can insert own whiteboards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own whiteboards" ON public.canvas_whiteboard FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: superjournal Users can insert their own superjournal entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own superjournal entries" ON public.superjournal FOR INSERT WITH CHECK (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: element_codes Users can read own image codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own image codes" ON public.element_codes FOR SELECT USING ((canvas_id IN ( SELECT canvas_designer.id
   FROM public.canvas_designer
  WHERE (canvas_designer.user_id = auth.uid()))));


--
-- Name: articles Users can update own articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own articles" ON public.articles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: article_charts Users can update own charts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own charts" ON public.article_charts FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: superjournal_charts Users can update own charts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own charts" ON public.superjournal_charts FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: article_chat Users can update own chat; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own chat" ON public.article_chat FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: canvas_designer Users can update own designer canvases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own designer canvases" ON public.canvas_designer FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: canvas_design Users can update own designs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own designs" ON public.canvas_design FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: canvas_planner_diary Users can update own diary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own diary" ON public.canvas_planner_diary FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: files Users can update own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own files" ON public.files FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: journal Users can update own journal entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own journal entries" ON public.journal FOR UPDATE USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: user_settings Users can update own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own settings" ON public.user_settings FOR UPDATE USING (((auth.uid() = user_id) OR public.is_admin(auth.uid()))) WITH CHECK (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: canvas_planner_tags Users can update own tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own tags" ON public.canvas_planner_tags FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: canvas_planner_todos Users can update own todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own todos" ON public.canvas_planner_todos FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: google_tokens Users can update own tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own tokens" ON public.google_tokens FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: canvas_whiteboard Users can update own whiteboards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own whiteboards" ON public.canvas_whiteboard FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: superjournal Users can update their own superjournal entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own superjournal entries" ON public.superjournal FOR UPDATE USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: article_chat_charts Users can view own article chat charts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own article chat charts" ON public.article_chat_charts FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: articles Users can view own articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own articles" ON public.articles FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: article_charts Users can view own charts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own charts" ON public.article_charts FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: superjournal_charts Users can view own charts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own charts" ON public.superjournal_charts FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: article_chat Users can view own chat; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own chat" ON public.article_chat FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: canvas_designer Users can view own designer canvases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own designer canvases" ON public.canvas_designer FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: canvas_design Users can view own designs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own designs" ON public.canvas_design FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: canvas_planner_diary Users can view own diary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own diary" ON public.canvas_planner_diary FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: files Users can view own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own files" ON public.files FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: journal Users can view own journal entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own journal entries" ON public.journal FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: user_roles Users can view own role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_settings Users can view own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own settings" ON public.user_settings FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: canvas_planner_tags Users can view own tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tags" ON public.canvas_planner_tags FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: canvas_planner_todos Users can view own todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own todos" ON public.canvas_planner_todos FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: token_usage Users can view own token usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own token usage" ON public.token_usage FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: google_tokens Users can view own tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tokens" ON public.google_tokens FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: canvas_whiteboard Users can view own whiteboards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own whiteboards" ON public.canvas_whiteboard FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: superjournal Users can view their own superjournal entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own superjournal entries" ON public.superjournal FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: article_charts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.article_charts ENABLE ROW LEVEL SECURITY;

--
-- Name: article_chat; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.article_chat ENABLE ROW LEVEL SECURITY;

--
-- Name: article_chat_charts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.article_chat_charts ENABLE ROW LEVEL SECURITY;

--
-- Name: articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

--
-- Name: canvas_design; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.canvas_design ENABLE ROW LEVEL SECURITY;

--
-- Name: canvas_designer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.canvas_designer ENABLE ROW LEVEL SECURITY;

--
-- Name: canvas_planner_diary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.canvas_planner_diary ENABLE ROW LEVEL SECURITY;

--
-- Name: canvas_planner_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.canvas_planner_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: canvas_planner_todos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.canvas_planner_todos ENABLE ROW LEVEL SECURITY;

--
-- Name: canvas_whiteboard; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.canvas_whiteboard ENABLE ROW LEVEL SECURITY;

--
-- Name: element_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.element_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: file_chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.file_chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

--
-- Name: google_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: journal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal ENABLE ROW LEVEL SECURITY;

--
-- Name: model_parameters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.model_parameters ENABLE ROW LEVEL SECURITY;

--
-- Name: models; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;

--
-- Name: personas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

--
-- Name: superjournal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.superjournal ENABLE ROW LEVEL SECURITY;

--
-- Name: superjournal_charts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.superjournal_charts ENABLE ROW LEVEL SECURITY;

--
-- Name: token_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict qfIFt6osTBMfFtPgWiXLH9YLdyDSOdzMOy2TV04fuVlHX2mgJREUVSQaqqOfl7J


-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('content', 'content', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for content bucket
CREATE POLICY "Users can upload own content" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'content' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read own content" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'content' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own content" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'content' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public read access" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'content');


-- ============================================================================
-- SEED DATA: Models
-- ============================================================================

 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Llama 3.3 70B Instruct', 'accounts/fireworks/models/llama-v3p3-70b-instruct', 'fireworks', 'text_generation', 131072, NULL, 0.9000, 0.9000, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Qwen3-235B', 'accounts/fireworks/models/qwen3-235b-a22b', 'fireworks', 'text_generation', 131072, 8192, 0.2200, 0.8800, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Dobby Mini Unhinged (Llama 3.1 8B)', 'accounts/sentientfoundation-serverless/models/dobby-mini-unhinged-plus-llama-3-1-8b', 'fireworks', 'text_generation', 131072, NULL, 0.2000, 0.2000, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Claude 3.5 Haiku', 'claude-3-5-haiku-20241022', 'anthropic', 'text_generation', 200000, NULL, 0.8000, 4.0000, true, 0.0000, true) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Claude 4.5 Haiku', 'claude-haiku-4-5', 'anthropic', 'text_generation', 200000, NULL, 1.0000, 5.0000, true, 0.0000, true) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Claude Opus 4.5', 'claude-opus-4-5-20251101', 'anthropic', 'text_generation', 200000, NULL, 15.0000, 75.0000, true, 0.0000, true) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Claude Sonnet 4.5', 'claude-sonnet-4-5-20250929', 'anthropic', 'text_generation', 200000, NULL, 3.0000, 15.0000, true, 0.0000, true) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Dolphin Mistral 24B Venice', 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', 'openrouter', 'text_generation', 32000, NULL, 0.0000, 0.0000, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('DeepSeek R1', 'deepseek-ai/deepseek-r1', 'replicate', 'text_generation', 64000, NULL, 0.5500, 2.1900, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Deliberate v3', 'deliberate-v3', 'modelslab', 'image_generation', 0, NULL, 0.0000, 0.0000, true, 0.0050, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('EpicRealism Natural Sin', 'epicrealism-natural-sin', 'modelslab', 'image_generation', 0, NULL, 0.0000, 0.0000, true, 0.0050, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Stable Diffusion XL', 'fal-ai/fast-sdxl', 'fal', 'image_generation', 0, NULL, 0.0000, 0.0000, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Fast SVD', 'fal-ai/fast-svd', 'fal', 'video_generation', 0, NULL, 0.0000, 0.0000, false, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('FLUX Kontext Dev', 'fal-ai/flux-kontext/dev', 'fal', 'image_edit', 0, NULL, 0.0000, 0.0000, true, 0.0250, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('FLUX Kontext Pro', 'fal-ai/flux-pro/kontext', 'fal', 'image_edit', 0, NULL, 0.0000, 0.0000, true, 0.0400, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('FLUX Kontext Max', 'fal-ai/flux-pro/kontext/max', 'fal', 'image_edit', 0, NULL, 0.0000, 0.0000, true, 0.0800, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('FLUX Pro 1.1', 'fal-ai/flux-pro/v1.1', 'fal', 'image_generation', 0, NULL, 50.0000, 0.0000, true, 0.0500, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('FLUX.1 Dev', 'fal-ai/flux/dev', 'fal', 'image_generation', 0, NULL, 25.0000, 0.0000, true, 0.0250, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('FLUX Dev img2img', 'fal-ai/flux/dev/image-to-image', 'fal', 'image_edit', 0, NULL, 0.0000, 0.0000, true, 0.0250, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('FLUX.1 Schnell', 'fal-ai/flux/schnell', 'fal', 'image_generation', 0, NULL, 3.0000, 0.0000, true, 0.0030, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Realistic Vision V6', 'fal-ai/realistic-vision', 'fal', 'image_generation', 0, NULL, 0.0000, 0.0000, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Z-Image Turbo', 'fal-ai/z-image/turbo/image-to-image', 'fal', 'image_edit', 0, NULL, 0.0000, 0.0000, true, 0.0050, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('FLUX Dev Uncensored', 'flux-dev-uncensored', 'venice', 'image_generation', 0, NULL, 0.0000, 0.0000, true, 0.0200, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('MythoMax L2 13B', 'gryphe/mythomax-l2-13b', 'openrouter', 'text_generation', 8192, NULL, 0.1000, 0.1000, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Juggernaut XL v9', 'juggernaut-xl-v9', 'modelslab', 'image_generation', 0, NULL, 0.0000, 0.0000, true, 0.0050, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Llama 3 Groq 70B Tool Use', 'llama-3-groq-70b-tool-use', 'groq', 'tool_calling', 8192, NULL, 0.0000, 0.0000, true, 0.0000, true) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Llama 3 Groq 8B Tool Use', 'llama-3-groq-8b-tool-use', 'groq', 'tool_calling', 8192, NULL, 0.0000, 0.0000, true, 0.0000, true) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Lustify SDXL', 'lustify-sdxl', 'venice', 'image_generation', 0, NULL, 0.0000, 0.0000, true, 0.0150, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Llama 4 Maverick', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'groq', 'text_generation', 131000, NULL, 0.2000, 0.6000, true, 0.0000, true) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Nous Hermes 3 Llama 3.1 70B', 'nousresearch/hermes-3-llama-3.1-70b', 'openrouter', 'text_generation', 131072, NULL, 0.4000, 0.4000, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('JoyCaption Beta One', 'nsfw-api/joycaption-beta-one', 'replicate', 'captioning', 4096, NULL, 1.0000, 0.0000, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Parakeet RNNT 1.1B', 'nvidia/parakeet-rnnt-1.1b', 'replicate', 'audio_transcription', 0, NULL, 0.0000, 0.0000, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('GPT-OSS 120B', 'openai/gpt-oss-120b', 'together', 'text_generation', 131000, NULL, 0.1600, 0.6000, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Realistic Vision v5.1', 'realistic-vision-v51', 'modelslab', 'image_generation', 0, NULL, 0.0000, 0.0000, true, 0.0050, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Euryale 70B', 'sao10k/l3.3-euryale-70b', 'openrouter', 'text_generation', 131072, NULL, 0.6500, 0.7500, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('TTS-1', 'tts-1', 'openai', 'audio_generation', 4096, NULL, 15.0000, 0.0000, true, 0.0000, true) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('TTS-1 HD', 'tts-1-hd', 'openai', 'audio_generation', 4096, NULL, 30.0000, 0.0000, true, 0.0000, true) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('FLUX Dev (Venice)', 'venice-flux-dev', 'venice', 'image_generation', 0, NULL, 0.0000, 0.0000, true, 0.0200, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Venice Uncensored', 'venice-uncensored', 'venice', 'text_generation', 32000, NULL, 0.0000, 0.0000, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Voyage 3', 'voyage-3', 'voyage', 'embedding', 32000, NULL, 0.0600, 0.0000, true, 0.0000, false) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Whisper', 'whisper-1', 'openai', 'audio_transcription', 0, NULL, 0.0060, 0.0000, true, 0.0000, true) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Whisper Large V3', 'whisper-large-v3', 'groq', 'audio_transcription', 0, NULL, 0.0000, 0.0000, true, 0.0000, true) ON CONFLICT (model_identifier) DO NOTHING;
 INSERT INTO public.models (model_name, model_identifier, provider, model_type, context_window, max_output_tokens, input_price_per_million, output_price_per_million, is_active, cost_per_image, supports_tool_calling) VALUES ('Grok 4.1 Fast', 'x-ai/grok-4.1-fast', 'openrouter', 'text_generation', 131000, NULL, 0.0000, 0.0000, true, 0.0000, true) ON CONFLICT (model_identifier) DO NOTHING;


-- ============================================================================
-- SEED DATA: Model Parameters
-- ============================================================================

 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('accounts/fireworks/models/llama-v3p3-70b-instruct', 'conversation', 0.70, 4096, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('accounts/sentientfoundation-serverless/models/dobby-mini-unhinged-plus-llama-3-1-8b', 'conversation', 0.80, 4096, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('claude-3-5-haiku-20241022', 'compression', 0.30, 2048, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('claude-3-5-haiku-20241022', 'conversation', 0.70, 4096, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('claude-haiku-4-5', 'compression', 0.30, 2048, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('claude-haiku-4-5', 'conversation', 0.70, 4096, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('claude-opus-4-5-20251101', 'compression', 0.30, 2048, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('claude-opus-4-5-20251101', 'conversation', 0.70, 8192, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('claude-sonnet-4-5-20250929', 'compression', 0.30, 2048, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('claude-sonnet-4-5-20250929', 'conversation', 0.70, 4096, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('cognitivecomputations/dolphin-mistral-24b-venice-edition:free', 'compression', 0.30, 2048, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('cognitivecomputations/dolphin-mistral-24b-venice-edition:free', 'conversation', 0.80, 4096, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('deepseek-ai/deepseek-r1', 'conversation', 0.70, 8192, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('gryphe/mythomax-l2-13b', 'compression', 0.30, 2048, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('gryphe/mythomax-l2-13b', 'conversation', 0.80, 4096, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('llama-3-groq-70b-tool-use', 'conversation', 0.00, 4096, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('llama-3-groq-8b-tool-use', 'conversation', 0.00, 4096, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('meta-llama/llama-4-maverick-17b-128e-instruct', 'conversation', 0.70, 8192, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('nousresearch/hermes-3-llama-3.1-70b', 'compression', 0.30, 2048, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('nousresearch/hermes-3-llama-3.1-70b', 'conversation', 0.80, 4096, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('openai/gpt-oss-120b', 'conversation', 0.70, 8192, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('sao10k/l3.3-euryale-70b', 'compression', 0.30, 2048, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('sao10k/l3.3-euryale-70b', 'conversation', 0.80, 4096, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('venice-uncensored', 'compression', 0.30, 2048, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('venice-uncensored', 'conversation', 0.80, 4096, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;
 INSERT INTO public.model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking) VALUES ('x-ai/grok-4.1-fast', 'conversation', 0.70, 8192, false, NULL) ON CONFLICT (model_identifier, use_case) DO NOTHING;


-- ============================================================================
-- END OF BASELINE MIGRATION
-- ============================================================================
