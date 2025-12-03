-- ============================================================================
-- ASURA DATABASE SCHEMA REFERENCE
-- ============================================================================
-- This is a REFERENCE DOCUMENT, not an executable migration.
-- Use this to understand the current database structure.
--
-- Last updated: 2025-11-27
-- Total tables: 12 (10 active, 2 deprecated)
-- ============================================================================

-- ============================================================================
-- SCHEMA OVERVIEW
-- ============================================================================
--
-- CHAT MODE TABLES:
--   superjournal     - Full conversation turns (working memory)
--   journal          - Compressed turns with embeddings (long-term memory)
--   token_usage      - API cost tracking per conversation
--
-- READER MODE TABLES:
--   articles         - Pasted HTML articles
--   article_charts   - Extracted chart/image metadata
--   article_chat     - Q&A conversation history
--
-- CONFIGURATION TABLES:
--   models           - LLM model catalog (Anthropic, Voyage)
--   model_parameters - Per-use-case model settings
--   user_settings    - User preferences
--   user_roles       - Admin role assignments
--
-- DEPRECATED TABLES:
--   files            - File upload metadata (feature removed)
--   file_chunks      - File chunks with embeddings (feature removed)
--
-- ============================================================================


-- ============================================================================
-- TABLE: superjournal
-- ============================================================================
-- Purpose: Stores full, uncompressed conversation turns
-- Used by: Chat mode - working memory (last 5 turns shown in context)
-- Size estimate: ~10KB per turn, grows with conversation length
--
-- Related tables:
--   - journal (1:1 via superjournal_id - compressed version)
--   - token_usage (1:1 via conversation_id - cost tracking)
-- ============================================================================

CREATE TABLE superjournal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    persona_name TEXT NOT NULL,                -- 'gunnar' or 'kirby'
    user_message TEXT NOT NULL,                -- Boss's full message
    ai_response TEXT NOT NULL,                 -- Full AI response
    model_identifier TEXT,                     -- e.g. 'claude-sonnet-4-5-20250929'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_starred BOOLEAN NOT NULL DEFAULT false  -- User-starred for importance
);

-- Indexes
-- idx_superjournal_user_id: Fast user filtering (RLS)
-- idx_superjournal_created_at: Ordering by recency
-- idx_superjournal_is_starred: Filter starred entries (partial index)


-- ============================================================================
-- TABLE: journal
-- ============================================================================
-- Purpose: Artisan Cut compressed conversation turns with embeddings
-- Used by: Chat mode - semantic search for relevant context retrieval
-- Size estimate: ~2KB per entry + 4KB embedding vector
--
-- Compression format (boss_essence, persona_essence, decision_arc_summary):
--   - boss_essence: Compressed user intent/question
--   - persona_essence: Compressed AI response key points
--   - decision_arc_summary: Reasoning/decision narrative
--
-- Salience scoring (1-10):
--   10: Critical instructions, major decisions
--   7-9: Important context, significant exchanges
--   4-6: Normal conversation turns
--   1-3: Routine/low-value exchanges
-- ============================================================================

CREATE TABLE journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    superjournal_id UUID REFERENCES superjournal(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    persona_name TEXT NOT NULL,
    boss_essence TEXT NOT NULL,                -- Compressed user message
    persona_essence TEXT NOT NULL,             -- Compressed AI response
    decision_arc_summary TEXT NOT NULL,        -- Reasoning summary
    salience_score INTEGER NOT NULL CHECK (salience_score >= 1 AND salience_score <= 10),
    is_starred BOOLEAN NOT NULL DEFAULT false,
    file_name TEXT,                            -- Associated file (deprecated)
    file_type TEXT,                            -- File MIME type (deprecated)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    embedding vector(1024)                     -- Voyage AI embedding
);

-- Indexes
-- idx_journal_embedding: HNSW index for fast cosine similarity search
-- idx_journal_salience_score: Priority ordering


-- ============================================================================
-- TABLE: models
-- ============================================================================
-- Purpose: LLM model catalog (Anthropic, Voyage AI)
-- Access: Read-only for users, admin-only modifications
--
-- Current models:
--   - claude-sonnet-4-5-20250929 (text_generation)
--   - claude-haiku-4-5 (text_generation)
--   - voyage-3 (embedding)
-- ============================================================================

CREATE TABLE models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name TEXT NOT NULL,                  -- Display name: 'Claude Sonnet 4.5'
    model_identifier TEXT NOT NULL UNIQUE,     -- API identifier
    provider TEXT NOT NULL DEFAULT 'anthropic', -- 'anthropic', 'voyage'
    model_type TEXT NOT NULL DEFAULT 'text_generation',  -- 'text_generation', 'embedding'
    context_window INTEGER NOT NULL,           -- Max input tokens
    max_output_tokens INTEGER,                 -- Max response tokens
    input_price_per_million DECIMAL(10,4),     -- Cost per 1M input tokens
    output_price_per_million DECIMAL(10,4),    -- Cost per 1M output tokens
    is_active BOOLEAN DEFAULT true,            -- Available for selection
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- TABLE: model_parameters
-- ============================================================================
-- Purpose: Per-use-case model configuration
-- Use cases:
--   - conversation: Chat responses (Call 1A/1B)
--   - compression: Memory compression (Call 2A/2B/3A/3B)
--   - reader: Article processing and Q&A
-- ============================================================================

CREATE TABLE model_parameters (
    model_identifier TEXT NOT NULL REFERENCES models(model_identifier) ON DELETE CASCADE,
    use_case TEXT NOT NULL,                    -- 'conversation', 'compression', 'reader'
    temperature DECIMAL(3,2) NOT NULL,         -- 0.0-1.0 (conversation: 0.7, compression: 0.3)
    max_tokens INTEGER NOT NULL,               -- Response token limit
    thinking_enabled BOOLEAN NOT NULL DEFAULT false,  -- Extended thinking mode
    max_tokens_thinking INTEGER,               -- Thinking budget (if enabled)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (model_identifier, use_case)
);


-- ============================================================================
-- TABLE: user_settings
-- ============================================================================
-- Purpose: Per-user preferences and model selections
-- Created: On first login (default values from code)
-- ============================================================================

CREATE TABLE user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    selected_persona TEXT NOT NULL DEFAULT 'gunnar',  -- 'gunnar' or 'kirby'
    selected_conversation_model TEXT NOT NULL,  -- Model for chat
    selected_compression_model TEXT NOT NULL,   -- Model for compression
    selected_embedding_model TEXT NOT NULL,     -- Model for embeddings
    selected_reader_model TEXT NOT NULL,        -- Model for reader
    active_reader_article_id UUID,              -- Currently open article
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- TABLE: user_roles
-- ============================================================================
-- Purpose: Admin role assignments for RLS bypass
-- Access: Users can view own role, only service role can modify
-- ============================================================================

CREATE TABLE user_roles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- TABLE: token_usage
-- ============================================================================
-- Purpose: API cost tracking per conversation turn
-- Access: Append-only (no UPDATE/DELETE for audit trail)
-- ============================================================================

CREATE TABLE token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES superjournal(id) ON DELETE CASCADE,
    model_identifier TEXT NOT NULL,
    total_input_tokens INTEGER NOT NULL DEFAULT 0,
    total_output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- TABLE: articles
-- ============================================================================
-- Purpose: E-reader articles (pasted HTML content)
-- Workflow:
--   1. User pastes HTML → status = 'processing', raw_html stored
--   2. AI processes → transformed_content + preview_snippet stored
--   3. Status set to 'ready'
-- ============================================================================

CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,                       -- Extracted from HTML <title>
    raw_html TEXT,                             -- Original pasted HTML
    transformed_content TEXT,                  -- AI-generated summary
    preview_snippet TEXT,                      -- First ~150 chars for list
    status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'ready', 'error'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- TABLE: article_charts
-- ============================================================================
-- Purpose: Metadata for extracted images/charts from articles
-- Workflow:
--   1. Images extracted from HTML
--   2. Stored in Supabase Storage (article-images bucket)
--   3. AI filters out ads (is_relevant = false)
--   4. Remaining charts shown in carousel
-- ============================================================================

CREATE TABLE article_charts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chart_index INTEGER NOT NULL,              -- 1, 2, 3... (sequential)
    storage_path TEXT NOT NULL,                -- Supabase storage path
    thumbnail_path TEXT,                       -- Thumbnail for carousel
    anthropic_file_id TEXT,                    -- Anthropic Files API ID (if used)
    anthropic_file_created_at TIMESTAMPTZ,     -- File ID creation (for expiry)
    alt_text TEXT DEFAULT '',                  -- Original <img> alt text
    is_relevant BOOLEAN DEFAULT true,          -- AI filtering result
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(article_id, chart_index)
);


-- ============================================================================
-- TABLE: article_chat
-- ============================================================================
-- Purpose: Q&A conversation history for articles
-- Similar to superjournal but for Reader mode
-- ============================================================================

CREATE TABLE article_chat (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,                        -- 'user' or 'assistant'
    content TEXT NOT NULL,                     -- Message content
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- DEPRECATED TABLE: files
-- ============================================================================
-- Purpose: File upload metadata (feature removed)
-- Status: Table retained for historical data, no new records
-- ============================================================================

CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    content_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- DEPRECATED TABLE: file_chunks
-- ============================================================================
-- Purpose: File chunks with embeddings (feature removed)
-- Status: Table retained for historical data, no new records
-- ============================================================================

CREATE TABLE file_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1024),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- KEY FUNCTIONS
-- ============================================================================

-- is_admin(user_id): Checks if user has admin role (used in RLS policies)
-- search_journal_by_embedding(...): Semantic search over journal entries
-- search_file_chunks(...): DEPRECATED - semantic search over file chunks
-- nuke_user_data(user_id): Deletes all user data (used by /api/nuke)


-- ============================================================================
-- RLS POLICY SUMMARY
-- ============================================================================
--
-- User-owned tables (superjournal, journal, user_settings, token_usage,
--                    articles, article_charts, article_chat):
--   - SELECT: user_id = auth.uid() OR is_admin(auth.uid())
--   - INSERT: user_id = auth.uid()
--   - UPDATE: user_id = auth.uid()
--   - DELETE: user_id = auth.uid()
--
-- Catalog tables (models, model_parameters):
--   - SELECT: auth.role() = 'authenticated' (read-only for all users)
--   - No INSERT/UPDATE/DELETE (admin-only via service role)
--
-- Admin table (user_roles):
--   - SELECT: user_id = auth.uid() (own role only)
--   - No INSERT/UPDATE/DELETE (admin-only via service role)
--
-- ============================================================================


-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================
--
-- article-images:
--   - Purpose: Chart/image files extracted from articles
--   - Path format: {user_id}/{article_id}/chart-{index}.png
--   - Access: RLS-protected, user can only access own files
--
-- ============================================================================


-- ============================================================================
-- ENTITY RELATIONSHIP DIAGRAM (ASCII)
-- ============================================================================
--
--  ┌─────────────┐     ┌─────────────┐
--  │ auth.users  │────<│ superjournal│
--  └─────────────┘     └──────┬──────┘
--         │                   │
--         │            ┌──────┴──────┐
--         │            │             │
--         │     ┌──────┴──────┐ ┌────┴─────┐
--         ├────<│   journal   │ │token_usage│
--         │     └─────────────┘ └──────────┘
--         │
--         ├────<┌─────────────┐
--         │     │user_settings│
--         │     └─────────────┘
--         │
--         ├────<┌─────────────┐
--         │     │ user_roles  │
--         │     └─────────────┘
--         │
--         ├────<┌─────────────┐     ┌───────────────┐
--         │     │  articles   │────<│ article_charts│
--         │     └──────┬──────┘     └───────────────┘
--         │            │
--         │     ┌──────┴──────┐
--         └────<│article_chat │
--               └─────────────┘
--
--  ┌──────────┐     ┌──────────────────┐
--  │  models  │────<│ model_parameters │
--  └──────────┘     └──────────────────┘
--
-- ============================================================================
