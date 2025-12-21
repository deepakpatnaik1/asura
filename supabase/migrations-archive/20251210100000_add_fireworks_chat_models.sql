-- Add Fireworks uncensored chat models for Eva persona
-- These models support NSFW content generation for character design
-- Part of multi-provider architecture: Anthropic (chat) + Fireworks (uncensored chat + images)

-- Hermes 2 Pro Mistral 7B - Fast, uncensored, budget-friendly
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  context_window,
  input_price_per_million,
  output_price_per_million,
  is_active
) VALUES (
  'Hermes 2 Pro 7B',
  'accounts/fireworks/models/hermes-2-pro-mistral-7b',
  'fireworks',
  32768,
  0.20,
  0.20,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million,
  is_active = EXCLUDED.is_active;

-- Model parameters for Hermes 2 Pro - conversation
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'accounts/fireworks/models/hermes-2-pro-mistral-7b',
  'conversation',
  0.8,
  8192,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Model parameters for Hermes 2 Pro - compression
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
  4096,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Dolphin 2.6 Mixtral 8x7B - Larger, more capable uncensored model
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  context_window,
  input_price_per_million,
  output_price_per_million,
  is_active
) VALUES (
  'Dolphin 2.6 Mixtral 8x7B',
  'accounts/fireworks/models/dolphin-2-6-mixtral-8x7b',
  'fireworks',
  32768,
  0.50,
  0.50,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million,
  is_active = EXCLUDED.is_active;

-- Model parameters for Dolphin 2.6 - conversation
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'accounts/fireworks/models/dolphin-2-6-mixtral-8x7b',
  'conversation',
  0.8,
  8192,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Model parameters for Dolphin 2.6 - compression
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
  4096,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Dolphin 2.9.2 Qwen2 72B - Premium uncensored model
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  context_window,
  input_price_per_million,
  output_price_per_million,
  is_active
) VALUES (
  'Dolphin 2.9.2 Qwen2 72B',
  'accounts/fireworks/models/dolphin-2-9-2-qwen2-72b',
  'fireworks',
  32768,
  0.90,
  0.90,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million,
  is_active = EXCLUDED.is_active;

-- Model parameters for Dolphin 2.9.2 - conversation
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'accounts/fireworks/models/dolphin-2-9-2-qwen2-72b',
  'conversation',
  0.8,
  8192,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Model parameters for Dolphin 2.9.2 - compression
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
  4096,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;
