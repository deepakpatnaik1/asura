-- Add captioning model type and JoyCaption model
-- Part of model types infrastructure work

-- =============================================================================
-- 1. ADD captioning TO model_type CHECK CONSTRAINT
-- =============================================================================

-- Drop existing constraint and recreate with captioning
ALTER TABLE models DROP CONSTRAINT IF EXISTS models_model_type_check;
ALTER TABLE models ADD CONSTRAINT models_model_type_check
  CHECK (model_type IN ('text_generation', 'embedding', 'image_generation', 'captioning'));

-- =============================================================================
-- 2. INSERT JOYCAPTION BETA ONE (REPLICATE)
-- =============================================================================

-- JoyCaption Beta One - Uncensored image captioning
-- Model: nsfw-api/joycaption-beta-one on Replicate
-- Pricing: ~$0.001/image (1020 runs per $1)
-- Latency: ~1 second
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
  'JoyCaption Beta One',
  'nsfw-api/joycaption-beta-one',
  'replicate',
  'captioning',
  4096,  -- Max context for output
  1.00,  -- ~$0.001/image, rough estimate as per-million
  0.00,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  is_active = EXCLUDED.is_active;

-- Note: Captioning models don't use model_parameters (captioning has its own params)
