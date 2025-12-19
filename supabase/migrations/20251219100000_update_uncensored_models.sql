-- Update uncensored model library
-- Remove older models, add Euryale 70B and Venice Uncensored

-- =============================================================================
-- 1. REMOVE OLDER MODELS
-- =============================================================================

-- Remove model_parameters first (FK constraint)
DELETE FROM model_parameters WHERE model_identifier IN (
  'neversleep/llama-3.1-lumimaid-70b',
  'cognitivecomputations/dolphin-mixtral-8x7b',
  'cognitivecomputations/dolphin-mixtral-8x22b'
);

-- Remove models
DELETE FROM models WHERE model_identifier IN (
  'neversleep/llama-3.1-lumimaid-70b',
  'cognitivecomputations/dolphin-mixtral-8x7b',
  'cognitivecomputations/dolphin-mixtral-8x22b'
);

-- =============================================================================
-- 2. ADD EURYALE 70B (OpenRouter)
-- =============================================================================

INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  model_type,
  context_window,
  input_price_per_million,
  output_price_per_million,
  is_active
) VALUES (
  'Euryale 70B',
  'sao10k/l3.3-euryale-70b',
  'openrouter',
  'text_generation',
  131072,
  0.65,
  0.75,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million,
  is_active = EXCLUDED.is_active;

-- Euryale model parameters
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('sao10k/l3.3-euryale-70b', 'conversation', 0.8, 4096)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;

INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('sao10k/l3.3-euryale-70b', 'compression', 0.3, 2048)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;

-- =============================================================================
-- 3. ADD VENICE UNCENSORED
-- =============================================================================

INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  model_type,
  context_window,
  input_price_per_million,
  output_price_per_million,
  is_active
) VALUES (
  'Venice Uncensored',
  'venice-uncensored',
  'venice',
  'text_generation',
  32000,
  0.00,
  0.00,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million,
  is_active = EXCLUDED.is_active;

-- Venice Uncensored model parameters
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('venice-uncensored', 'conversation', 0.8, 4096)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;

INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('venice-uncensored', 'compression', 0.3, 2048)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;
