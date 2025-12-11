-- Remove Dolphin models (not available serverless on Fireworks)
-- Add Dobby uncensored model as alternative

-- 1. Clear model_overrides referencing Dolphin
DELETE FROM model_overrides WHERE model LIKE '%dolphin%';

-- 2. Delete model_parameters for Dolphin
DELETE FROM model_parameters WHERE model_identifier LIKE '%dolphin%';

-- 3. Delete Dolphin models
DELETE FROM models WHERE model_identifier LIKE '%dolphin%';

-- 4. Add Dobby uncensored model (serverless available)
INSERT INTO models (model_identifier, model_name, provider, model_type, context_window, input_price_per_million, output_price_per_million)
VALUES (
  'accounts/sentientfoundation-serverless/models/dobby-mini-unhinged-plus-llama-3-1-8b',
  'Dobby Mini Unhinged (Llama 3.1 8B)',
  'fireworks',
  'text_generation',
  131072,
  0.20,
  0.20
) ON CONFLICT (model_identifier) DO NOTHING;

-- 5. Add model_parameters for Dobby
INSERT INTO model_parameters (model_identifier, use_case, max_tokens, temperature)
VALUES (
  'accounts/sentientfoundation-serverless/models/dobby-mini-unhinged-plus-llama-3-1-8b',
  'conversation',
  4096,
  0.8
) ON CONFLICT (model_identifier, use_case) DO NOTHING;
