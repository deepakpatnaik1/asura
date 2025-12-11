-- Add community-favorite uncensored/creative models (OpenRouter)
-- Following workflow: models table + model_parameters for both conversation AND compression

-- =============================================================================
-- 1. INSERT MODELS
-- =============================================================================

-- Mistral Nemo Celeste 12B (by Nothing is Real)
-- Top pick for creative writing, smart narration
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  model_type,
  context_window,
  input_price_per_million,
  output_price_per_million
) VALUES (
  'Mistral Nemo Celeste 12B',
  'nothingiisreal/mn-celeste-12b',
  'openrouter',
  'text_generation',
  128000,
  0.15,
  0.15
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million;

-- Llama 3 Lumimaid 70B (by NeverSleep)
-- Balanced RP/eRP, serious but uncensored
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  model_type,
  context_window,
  input_price_per_million,
  output_price_per_million
) VALUES (
  'Llama 3 Lumimaid 70B',
  'neversleep/llama-3-lumimaid-70b',
  'openrouter',
  'text_generation',
  8192,
  0.80,
  0.80
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million;

-- Dolphin Mistral 24B Venice Edition (by Cognitive Computations)
-- Explicitly uncensored, free tier available
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  model_type,
  context_window,
  input_price_per_million,
  output_price_per_million
) VALUES (
  'Dolphin Mistral 24B Venice',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  'openrouter',
  'text_generation',
  32000,
  0.00,
  0.00
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million;

-- Nous Hermes 3 Llama 3.1 8B (by NousResearch)
-- Great for creative, abliterated
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  model_type,
  context_window,
  input_price_per_million,
  output_price_per_million
) VALUES (
  'Nous Hermes 3 Llama 3.1 8B',
  'nousresearch/hermes-3-llama-3.1-8b',
  'openrouter',
  'text_generation',
  131072,
  0.20,
  0.20
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million;

-- =============================================================================
-- 2. INSERT MODEL PARAMETERS (conversation + compression for each)
-- =============================================================================

-- Mistral Nemo Celeste 12B
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('nothingiisreal/mn-celeste-12b', 'conversation', 0.8, 4096)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;

INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('nothingiisreal/mn-celeste-12b', 'compression', 0.3, 2048)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;

-- Llama 3 Lumimaid 70B
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('neversleep/llama-3-lumimaid-70b', 'conversation', 0.8, 4096)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;

INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('neversleep/llama-3-lumimaid-70b', 'compression', 0.3, 2048)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;

-- Dolphin Mistral 24B Venice
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('cognitivecomputations/dolphin-mistral-24b-venice-edition:free', 'conversation', 0.8, 4096)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;

INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('cognitivecomputations/dolphin-mistral-24b-venice-edition:free', 'compression', 0.3, 2048)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;

-- Nous Hermes 3 Llama 3.1 8B
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('nousresearch/hermes-3-llama-3.1-8b', 'conversation', 0.8, 4096)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;

INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('nousresearch/hermes-3-llama-3.1-8b', 'compression', 0.3, 2048)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;
