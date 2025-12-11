-- Fix Fireworks Dolphin model identifiers (wrong format in previous migration)
-- Due to FK constraints, delete params first, update models, then re-add params

-- 1. Delete model_parameters for wrong identifiers
DELETE FROM model_parameters WHERE model_identifier = 'accounts/fireworks/models/dolphin-2-6-mixtral-8x7b';
DELETE FROM model_parameters WHERE model_identifier = 'accounts/fireworks/models/dolphin-2-9-2-qwen2-72b';

-- 2. Update model_overrides (no FK)
UPDATE model_overrides SET model = 'accounts/fireworks/dolphin-2p6-mixtral-8x7b'
WHERE model = 'accounts/fireworks/models/dolphin-2-6-mixtral-8x7b';

UPDATE model_overrides SET model = 'accounts/fireworks/dolphin-2-9-2-qwen2-72b'
WHERE model = 'accounts/fireworks/models/dolphin-2-9-2-qwen2-72b';

-- 3. Update models table
UPDATE models SET model_identifier = 'accounts/fireworks/dolphin-2p6-mixtral-8x7b'
WHERE model_identifier = 'accounts/fireworks/models/dolphin-2-6-mixtral-8x7b';

UPDATE models SET model_identifier = 'accounts/fireworks/dolphin-2-9-2-qwen2-72b'
WHERE model_identifier = 'accounts/fireworks/models/dolphin-2-9-2-qwen2-72b';

-- 4. Re-add model_parameters with correct identifiers
INSERT INTO model_parameters (model_identifier, use_case, max_tokens, temperature) VALUES
('accounts/fireworks/dolphin-2p6-mixtral-8x7b', 'conversation', 4096, 0.8),
('accounts/fireworks/dolphin-2-9-2-qwen2-72b', 'conversation', 4096, 0.8)
ON CONFLICT (model_identifier, use_case) DO NOTHING;
