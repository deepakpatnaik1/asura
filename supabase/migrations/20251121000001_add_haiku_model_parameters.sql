-- Add model parameters for Claude Haiku models
-- Migration: Add parameters for 3.5 Haiku and 4.5 Haiku

-- Claude 3.5 Haiku - Conversation use case
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'claude-3-5-haiku-20241022',
  'conversation',
  0.7,
  4096,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Claude 3.5 Haiku - Compression use case
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'claude-3-5-haiku-20241022',
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

-- Claude 4.5 Haiku - Conversation use case
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'claude-haiku-4-5',
  'conversation',
  0.7,
  4096,
  false,
  NULL
) ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  thinking_enabled = EXCLUDED.thinking_enabled,
  max_tokens_thinking = EXCLUDED.max_tokens_thinking;

-- Claude 4.5 Haiku - Compression use case
INSERT INTO model_parameters (
  model_identifier,
  use_case,
  temperature,
  max_tokens,
  thinking_enabled,
  max_tokens_thinking
) VALUES (
  'claude-haiku-4-5',
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
