-- Add image_edit model type and FLUX Kontext models
-- These are instruction-based editing models that preserve identity

-- 1. UPDATE model_type CHECK CONSTRAINT to include image_edit
ALTER TABLE models DROP CONSTRAINT IF EXISTS models_model_type_check;
ALTER TABLE models ADD CONSTRAINT models_model_type_check
  CHECK (model_type IN ('text_generation', 'embedding', 'image_generation', 'captioning', 'image_edit', 'audio_generation', 'audio_transcription', 'video_generation'));

-- 2. INSERT FLUX KONTEXT MODELS (Fal.ai)
-- FLUX Kontext Dev - Good quality, open source
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  model_type,
  context_window,
  input_price_per_million,
  output_price_per_million,
  cost_per_image,
  is_active
) VALUES (
  'FLUX Kontext Dev',
  'fal-ai/flux-kontext/dev',
  'fal',
  'image_edit',
  0,
  0,
  0,
  0.025,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  model_type = EXCLUDED.model_type,
  cost_per_image = EXCLUDED.cost_per_image,
  is_active = EXCLUDED.is_active;

-- FLUX Kontext Pro - Premium quality
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  model_type,
  context_window,
  input_price_per_million,
  output_price_per_million,
  cost_per_image,
  is_active
) VALUES (
  'FLUX Kontext Pro',
  'fal-ai/flux-pro/kontext',
  'fal',
  'image_edit',
  0,
  0,
  0,
  0.040,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  model_type = EXCLUDED.model_type,
  cost_per_image = EXCLUDED.cost_per_image,
  is_active = EXCLUDED.is_active;
