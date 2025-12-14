-- Add audio and video model types
-- Part of model types infrastructure work (Phase 3 & 4)

-- =============================================================================
-- 1. UPDATE model_type CHECK CONSTRAINT
-- =============================================================================

-- Drop existing constraint and recreate with audio and video types
ALTER TABLE models DROP CONSTRAINT IF EXISTS models_model_type_check;
ALTER TABLE models ADD CONSTRAINT models_model_type_check
  CHECK (model_type IN (
    'text_generation',
    'embedding',
    'image_generation',
    'captioning',
    'audio_transcription',
    'audio_generation',
    'video_generation'
  ));

-- =============================================================================
-- 2. INSERT AUDIO TRANSCRIPTION MODELS
-- =============================================================================

-- OpenAI Whisper
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
  'Whisper',
  'whisper-1',
  'openai',
  'audio_transcription',
  0,  -- N/A for audio
  0.006,  -- $0.006/minute
  0.00,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  is_active = EXCLUDED.is_active;

-- Groq Whisper (faster, cheaper)
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
  'Whisper Large V3',
  'whisper-large-v3',
  'groq',
  'audio_transcription',
  0,
  0.00,  -- Free tier available
  0.00,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  is_active = EXCLUDED.is_active;

-- Nvidia Parakeet (best accuracy, via Replicate)
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
  'Parakeet RNNT 1.1B',
  'nvidia/parakeet-rnnt-1.1b',
  'replicate',
  'audio_transcription',
  0,
  0.00,  -- ~$0.01/run
  0.00,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  is_active = EXCLUDED.is_active;

-- =============================================================================
-- 3. INSERT AUDIO GENERATION MODELS (TTS)
-- =============================================================================

-- OpenAI TTS
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
  'TTS-1',
  'tts-1',
  'openai',
  'audio_generation',
  4096,  -- Character limit
  15.00,  -- $0.015 per 1K chars = $15/million
  0.00,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  is_active = EXCLUDED.is_active;

-- OpenAI TTS HD
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
  'TTS-1 HD',
  'tts-1-hd',
  'openai',
  'audio_generation',
  4096,
  30.00,  -- $0.030 per 1K chars
  0.00,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  is_active = EXCLUDED.is_active;

-- =============================================================================
-- 4. INSERT VIDEO GENERATION MODELS
-- =============================================================================

-- Note: Video models require version IDs in code. These entries are placeholders.
-- Update version IDs in generate-replicate.ts and generate-fal.ts as needed.

-- Fal Fast SVD (img2vid)
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
  'Fast SVD',
  'fal-ai/fast-svd',
  'fal',
  'video_generation',
  0,
  0.00,  -- Per-generation pricing
  0.00,
  false  -- Disabled until version configured
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  model_type = EXCLUDED.model_type,
  is_active = EXCLUDED.is_active;
