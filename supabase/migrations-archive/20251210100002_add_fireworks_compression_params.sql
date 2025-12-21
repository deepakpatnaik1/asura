-- Add compression use case parameters for Fireworks chat models
-- Required for personas with compression enabled (Gunnar, Kirby, etc.)

-- Hermes 2 Pro - compression
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'accounts/fireworks/models/hermes-2-pro-mistral-7b',
  'compression',
  0.3,
  2048,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Dolphin 2.6 - compression
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'accounts/fireworks/models/dolphin-2-6-mixtral-8x7b',
  'compression',
  0.3,
  2048,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Dolphin 2.9.2 - compression
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'accounts/fireworks/models/dolphin-2-9-2-qwen2-72b',
  'compression',
  0.3,
  2048,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;
