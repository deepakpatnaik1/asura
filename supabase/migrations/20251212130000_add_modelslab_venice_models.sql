-- Add cost_per_image column and ModelsLab/Venice AI image models
-- Run date: 2025-12-12

-- =============================================================================
-- 1. ADD cost_per_image COLUMN
-- =============================================================================
ALTER TABLE models ADD COLUMN IF NOT EXISTS cost_per_image DECIMAL(10, 4) DEFAULT 0.00;

-- =============================================================================
-- 2. UPDATE EXISTING FAL.AI IMAGE MODELS
-- =============================================================================
UPDATE models SET cost_per_image = 0.025 WHERE model_identifier = 'fal-ai/flux/dev';
UPDATE models SET cost_per_image = 0.003 WHERE model_identifier = 'fal-ai/flux/schnell';
UPDATE models SET cost_per_image = 0.050 WHERE model_identifier = 'fal-ai/flux-pro/v1.1';
UPDATE models SET cost_per_image = 0.000 WHERE model_identifier = 'fal-ai/realistic-vision';
UPDATE models SET cost_per_image = 0.000 WHERE model_identifier = 'fal-ai/fast-sdxl';

-- =============================================================================
-- 3. UPDATE EXISTING FIREWORKS IMAGE MODELS (if any)
-- =============================================================================
UPDATE models SET cost_per_image = 0.0014 WHERE model_identifier = 'accounts/fireworks/models/flux-1-schnell-fp8';
UPDATE models SET cost_per_image = 0.014 WHERE model_identifier = 'accounts/fireworks/models/flux-1-dev-fp8';
UPDATE models SET cost_per_image = 0.040 WHERE model_identifier = 'accounts/fireworks/models/flux-1-1-pro';

-- =============================================================================
-- 4. ADD MODELSLAB MODELS
-- =============================================================================
INSERT INTO models (model_name, model_identifier, provider, model_type, context_window, input_price_per_million, output_price_per_million, cost_per_image)
VALUES
  ('Realistic Vision v5.1', 'realistic-vision-v51', 'modelslab', 'image_generation', 0, 0, 0, 0.005),
  ('Juggernaut XL v9', 'juggernaut-xl-v9', 'modelslab', 'image_generation', 0, 0, 0, 0.005),
  ('EpicRealism Natural Sin', 'epicrealism-natural-sin', 'modelslab', 'image_generation', 0, 0, 0, 0.005),
  ('Deliberate v3', 'deliberate-v3', 'modelslab', 'image_generation', 0, 0, 0, 0.005)
ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  cost_per_image = EXCLUDED.cost_per_image;

-- =============================================================================
-- 5. ADD VENICE AI MODELS
-- =============================================================================
INSERT INTO models (model_name, model_identifier, provider, model_type, context_window, input_price_per_million, output_price_per_million, cost_per_image)
VALUES
  ('FLUX Dev Uncensored', 'flux-dev-uncensored', 'venice', 'image_generation', 0, 0, 0, 0.020),
  ('FLUX Dev (Venice)', 'venice-flux-dev', 'venice', 'image_generation', 0, 0, 0, 0.020),
  ('Lustify SDXL', 'lustify-sdxl', 'venice', 'image_generation', 0, 0, 0, 0.015)
ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  cost_per_image = EXCLUDED.cost_per_image;
