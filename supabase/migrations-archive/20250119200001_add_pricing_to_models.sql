-- Add pricing columns to models table
-- Part of Sonnet 4.5 Megafeature: Chunk 1

ALTER TABLE models
  ADD COLUMN IF NOT EXISTS input_price_per_million DECIMAL(10, 4) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS output_price_per_million DECIMAL(10, 4) DEFAULT 0.00;

-- Update existing Qwen models with pricing data
-- Pricing source: Fireworks AI (https://fireworks.ai/pricing)

-- Qwen3-235B Instruct (compression model)
UPDATE models
SET
  input_price_per_million = 0.90,
  output_price_per_million = 0.90
WHERE model_identifier = 'accounts/fireworks/models/qwen3-235b-a22b-instruct';

-- Qwen3-235B Thinking (conversation model - thinking variant)
UPDATE models
SET
  input_price_per_million = 0.90,
  output_price_per_million = 0.90
WHERE model_identifier = 'accounts/fireworks/models/qwen3-235b-a22b';

-- Qwen3-235B Instruct FP8 (cheaper variant)
UPDATE models
SET
  input_price_per_million = 0.90,
  output_price_per_million = 0.90
WHERE model_identifier = 'accounts/fireworks/models/qwen3-235b-a22b-instruct-fp8';
