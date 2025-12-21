-- Add Groq tool-use models for Layer 2 (dedicated tool calling)
-- These models are #1 and #3 on Berkeley Function Calling Leaderboard

-- 1. ADD TOOL_CALLING TO MODEL_TYPE CHECK CONSTRAINT
ALTER TABLE models DROP CONSTRAINT IF EXISTS models_model_type_check;
ALTER TABLE models ADD CONSTRAINT models_model_type_check
  CHECK (model_type IN ('text_generation', 'embedding', 'image_generation', 'captioning', 'image_edit', 'audio_generation', 'audio_transcription', 'video_generation', 'tool_calling'));

-- 2. ADD GROQ TOOL-USE MODELS
INSERT INTO models (model_identifier, model_name, provider, context_window, model_type, is_active) VALUES
-- Llama-3-Groq-8B-Tool-Use: #3 on BFCL, cheapest option
('llama-3-groq-8b-tool-use', 'Llama 3 Groq 8B Tool Use', 'groq', 8192, 'tool_calling', true),
-- Llama-3-Groq-70B-Tool-Use: #1 on BFCL, best accuracy
('llama-3-groq-70b-tool-use', 'Llama 3 Groq 70B Tool Use', 'groq', 8192, 'tool_calling', true)
ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  context_window = EXCLUDED.context_window,
  model_type = EXCLUDED.model_type,
  is_active = EXCLUDED.is_active;

-- 3. ADD MODEL PARAMETERS
INSERT INTO model_parameters (model_identifier, use_case, max_tokens, temperature) VALUES
('llama-3-groq-8b-tool-use', 'conversation', 4096, 0.0),
('llama-3-groq-70b-tool-use', 'conversation', 4096, 0.0)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  max_tokens = EXCLUDED.max_tokens,
  temperature = EXCLUDED.temperature;

-- 4. ADD MODEL_TOOL_CALLING COLUMN TO USER_SETTINGS
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_tool_calling TEXT;
