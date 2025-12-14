-- Add Claude Opus 4.5 to models table
-- This is the most capable Anthropic model

INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  model_type,
  context_window,
  input_price_per_million,
  output_price_per_million,
  is_active,
  can_compress
) VALUES (
  'Claude Opus 4.5',
  'claude-opus-4-5-20251101',
  'anthropic',
  'text_generation',
  200000,
  15.00,
  75.00,
  true,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million,
  is_active = EXCLUDED.is_active,
  can_compress = EXCLUDED.can_compress;

-- Add model parameters for conversation and compression
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('claude-opus-4-5-20251101', 'conversation', 0.7, 8192)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens;

INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('claude-opus-4-5-20251101', 'compression', 0.3, 2048)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens;
