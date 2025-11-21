-- Add Claude Haiku models for cost-effective development and testing
-- Migration: Add Claude 3.5 Haiku and Claude 4.5 Haiku

-- Insert Claude 3.5 Haiku (budget-friendly, recommended for dev/test)
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  context_window,
  input_price_per_million,
  output_price_per_million
) VALUES (
  'Claude 3.5 Haiku',
  'claude-3-5-haiku-20241022',
  'anthropic',
  200000,
  0.80,
  4.00
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million;

-- Insert Claude 4.5 Haiku (newest Haiku, still cheaper than Sonnet)
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  context_window,
  input_price_per_million,
  output_price_per_million
) VALUES (
  'Claude 4.5 Haiku',
  'claude-haiku-4-5',
  'anthropic',
  200000,
  1.00,
  5.00
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million;
