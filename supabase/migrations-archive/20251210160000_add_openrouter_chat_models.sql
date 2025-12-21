-- Add OpenRouter uncensored chat models
-- Multi-provider architecture: any persona can use any model from any provider

-- MythoMax-L2-13B - Legendary for roleplay and creative writing
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  context_window,
  input_price_per_million,
  output_price_per_million,
  is_active
) VALUES (
  'MythoMax L2 13B',
  'gryphe/mythomax-l2-13b',
  'openrouter',
  8192,
  0.10,
  0.10,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million,
  is_active = EXCLUDED.is_active;

-- Model parameters for MythoMax - conversation
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'gryphe/mythomax-l2-13b',
  'conversation',
  0.8,
  4096,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Model parameters for MythoMax - compression
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'gryphe/mythomax-l2-13b',
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

-- Dolphin Mistral 24B Venice - Newest uncensored from Venice.ai
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  context_window,
  input_price_per_million,
  output_price_per_million,
  is_active
) VALUES (
  'Dolphin Mistral 24B Venice',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition',
  'openrouter',
  32768,
  0.30,
  0.30,
  true
) ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  provider = EXCLUDED.provider,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million,
  is_active = EXCLUDED.is_active;

-- Model parameters for Dolphin Venice - conversation
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'cognitivecomputations/dolphin-mistral-24b-venice-edition',
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

-- Model parameters for Dolphin Venice - compression
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'cognitivecomputations/dolphin-mistral-24b-venice-edition',
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
