-- Add embedding model selection and per-use-case model parameters
-- Part of Configuration Management Fix: Chunk 0 (REDESIGNED)

-- ============================================================================
-- PART 1: Add model_type column to models table
-- ============================================================================

-- Add model_type column to distinguish text generation from embedding models
ALTER TABLE models
  ADD COLUMN IF NOT EXISTS model_type TEXT NOT NULL
    DEFAULT 'text_generation'
    CHECK (model_type IN ('text_generation', 'embedding'));

-- Set model_type for existing models
UPDATE models SET model_type = 'text_generation' WHERE provider IN ('anthropic', 'fireworks');
UPDATE models SET model_type = 'embedding' WHERE provider = 'voyage';

-- Add comment
COMMENT ON COLUMN models.model_type IS 'Model category: text_generation (chat/compression) or embedding (vectors)';

-- ============================================================================
-- PART 2: Add embedding model to user_settings
-- ============================================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS selected_embedding_model TEXT
    REFERENCES models(model_identifier) ON DELETE RESTRICT;

-- Set default for existing rows
UPDATE user_settings
SET selected_embedding_model = 'voyage-3'
WHERE selected_embedding_model IS NULL;

-- Make NOT NULL after backfilling
ALTER TABLE user_settings
  ALTER COLUMN selected_embedding_model SET NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN user_settings.selected_embedding_model IS 'Model used for generating embeddings (journal, file chunks)';

-- ============================================================================
-- PART 3: Create model_parameters table (use-case-specific parameters)
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_parameters (
  model_identifier TEXT NOT NULL REFERENCES models(model_identifier) ON DELETE CASCADE,
  use_case TEXT NOT NULL CHECK (use_case IN ('conversation', 'compression')),
  temperature DECIMAL(3,2) NOT NULL CHECK (temperature >= 0.0 AND temperature <= 1.0),
  max_tokens INTEGER NOT NULL CHECK (max_tokens > 0),
  thinking_enabled BOOLEAN NOT NULL DEFAULT false,
  max_tokens_thinking INTEGER CHECK (max_tokens_thinking IS NULL OR max_tokens_thinking > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (model_identifier, use_case)
);

-- Add comments
COMMENT ON TABLE model_parameters IS 'Use-case-specific parameters for LLM models';
COMMENT ON COLUMN model_parameters.use_case IS 'conversation (Call 1A/1B) or compression (Call 2A/2B/3A/3B)';
COMMENT ON COLUMN model_parameters.temperature IS 'Temperature for this model in this use case (0.0-1.0)';
COMMENT ON COLUMN model_parameters.max_tokens IS 'Standard max tokens for this use case';
COMMENT ON COLUMN model_parameters.thinking_enabled IS 'Whether extended thinking is enabled for this use case';
COMMENT ON COLUMN model_parameters.max_tokens_thinking IS 'Max tokens when thinking enabled (nullable)';

-- ============================================================================
-- PART 4: Populate parameters for Claude Sonnet 4.5
-- ============================================================================

-- Claude Sonnet 4.5 - Conversation use case
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'claude-sonnet-4-5-20250929',
  'conversation',
  0.7,
  4096,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Claude Sonnet 4.5 - Compression use case
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'claude-sonnet-4-5-20250929',
  'compression',
  0.3,
  2048,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- ============================================================================
-- PART 5: Insert Qwen3-235B Instruct model (if missing)
-- ============================================================================

INSERT INTO models (
  model_identifier,
  model_name,
  provider,
  model_type,
  context_window,
  input_price_per_million,
  output_price_per_million
)
VALUES (
  'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507',
  'Qwen3-235B Instruct',
  'fireworks',
  'text_generation',
  262144,
  0.90,
  0.90
)
ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million;

-- ============================================================================
-- PART 6: Populate parameters for Qwen models
-- ============================================================================

-- Qwen3-235B (thinking variant) - Conversation use case
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'accounts/fireworks/models/qwen3-235b-a22b',
  'conversation',
  0.7,
  4096,
  true,
  4096
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Qwen3-235B (thinking variant) - Compression use case
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'accounts/fireworks/models/qwen3-235b-a22b',
  'compression',
  0.3,
  2048,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Qwen3-235B Instruct - Conversation use case
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507',
  'conversation',
  0.7,
  4096,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Qwen3-235B Instruct - Compression use case
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507',
  'compression',
  0.3,
  2048,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- ============================================================================
-- PART 7: Update voyage-3 model_type (already exists, just set type)
-- ============================================================================

-- Voyage-3 should already exist from earlier migration, just ensure model_type is set
UPDATE models
SET model_type = 'embedding'
WHERE model_identifier = 'voyage-3';

-- Note: Embedding models don't need parameters in model_parameters table
-- (no temperature/max_tokens for embedding generation)
