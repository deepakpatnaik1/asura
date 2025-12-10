-- Increase max_tokens for Fireworks models
-- Runaway generation prevented at system prompt level, so we can be more generous

-- Hermes 2 Pro - conversation
UPDATE model_parameters
SET max_tokens = 8192
WHERE model_identifier = 'accounts/fireworks/models/hermes-2-pro-mistral-7b'
AND use_case = 'conversation';

-- Hermes 2 Pro - compression
UPDATE model_parameters
SET max_tokens = 4096
WHERE model_identifier = 'accounts/fireworks/models/hermes-2-pro-mistral-7b'
AND use_case = 'compression';

-- Dolphin 2.6 - conversation
UPDATE model_parameters
SET max_tokens = 8192
WHERE model_identifier = 'accounts/fireworks/models/dolphin-2-6-mixtral-8x7b'
AND use_case = 'conversation';

-- Dolphin 2.6 - compression
UPDATE model_parameters
SET max_tokens = 4096
WHERE model_identifier = 'accounts/fireworks/models/dolphin-2-6-mixtral-8x7b'
AND use_case = 'compression';

-- Dolphin 2.9.2 - conversation
UPDATE model_parameters
SET max_tokens = 8192
WHERE model_identifier = 'accounts/fireworks/models/dolphin-2-9-2-qwen2-72b'
AND use_case = 'conversation';

-- Dolphin 2.9.2 - compression
UPDATE model_parameters
SET max_tokens = 4096
WHERE model_identifier = 'accounts/fireworks/models/dolphin-2-9-2-qwen2-72b'
AND use_case = 'compression';
