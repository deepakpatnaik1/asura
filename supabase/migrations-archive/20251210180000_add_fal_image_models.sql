-- Add fal.ai image generation models
-- These models support enable_safety_checker: false for unrestricted output

-- =============================================================================
-- 0. ADD image_generation TO model_type CHECK CONSTRAINT
-- =============================================================================

-- Drop existing constraint and recreate with image_generation
ALTER TABLE models DROP CONSTRAINT IF EXISTS models_model_type_check;
ALTER TABLE models ADD CONSTRAINT models_model_type_check
  CHECK (model_type IN ('text_generation', 'embedding', 'image_generation'));

-- =============================================================================
-- 1. INSERT FAL.AI IMAGE MODELS
-- =============================================================================

-- FLUX.1 [dev] - High quality, $0.025/megapixel
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
  'FLUX.1 Dev',
  'fal-ai/flux/dev',
  'fal',
  'image_generation',
  0,  -- N/A for image models
  25.00,  -- $0.025/megapixel expressed as per-million (rough estimate)
  0.00,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  input_price_per_million = EXCLUDED.input_price_per_million,
  is_active = EXCLUDED.is_active;

-- FLUX.1 [schnell] - Fast generation
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
  'FLUX.1 Schnell',
  'fal-ai/flux/schnell',
  'fal',
  'image_generation',
  0,
  3.00,  -- Cheaper than dev
  0.00,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  input_price_per_million = EXCLUDED.input_price_per_million,
  is_active = EXCLUDED.is_active;

-- FLUX Pro 1.1 - Professional quality
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
  'FLUX Pro 1.1',
  'fal-ai/flux-pro/v1.1',
  'fal',
  'image_generation',
  0,
  50.00,  -- Premium pricing
  0.00,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  input_price_per_million = EXCLUDED.input_price_per_million,
  is_active = EXCLUDED.is_active;

-- Realistic Vision V6 - FREE, great for realistic/NSFW content
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
  'Realistic Vision V6',
  'fal-ai/realistic-vision',
  'fal',
  'image_generation',
  0,
  0.00,  -- FREE
  0.00,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  input_price_per_million = EXCLUDED.input_price_per_million,
  is_active = EXCLUDED.is_active;

-- Stable Diffusion XL
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
  'Stable Diffusion XL',
  'fal-ai/fast-sdxl',
  'fal',
  'image_generation',
  0,
  0.00,  -- Free tier available
  0.00,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  input_price_per_million = EXCLUDED.input_price_per_million,
  is_active = EXCLUDED.is_active;

-- Note: Image generation models don't use model_parameters (no temperature/max_tokens)
