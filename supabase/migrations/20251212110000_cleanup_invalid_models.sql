-- Clean up fictional and invalid model entries
-- These were placeholder entries for testing provider wiring
-- Note: model_overrides uses 'model' column, model_parameters uses 'model_identifier'

-- Delete fictional OpenAI model (GPT-5.2 doesn't exist)
DELETE FROM model_parameters WHERE model_identifier = 'gpt-5.2-chat-latest';
DELETE FROM model_overrides WHERE model = 'gpt-5.2-chat-latest';
DELETE FROM models WHERE model_identifier = 'gpt-5.2-chat-latest';

-- Delete fictional Google model (Gemini 3 Pro Preview doesn't exist)
DELETE FROM model_parameters WHERE model_identifier = 'gemini-3-pro-preview-11-2025';
DELETE FROM model_overrides WHERE model = 'gemini-3-pro-preview-11-2025';
DELETE FROM models WHERE model_identifier = 'gemini-3-pro-preview-11-2025';

-- Delete stale OpenRouter models (no longer available)
DELETE FROM model_parameters WHERE model_identifier = 'neversleep/llama-3-lumimaid-70b';
DELETE FROM model_overrides WHERE model = 'neversleep/llama-3-lumimaid-70b';
DELETE FROM models WHERE model_identifier = 'neversleep/llama-3-lumimaid-70b';

DELETE FROM model_parameters WHERE model_identifier = 'nothingiisreal/mn-celeste-12b';
DELETE FROM model_overrides WHERE model = 'nothingiisreal/mn-celeste-12b';
DELETE FROM models WHERE model_identifier = 'nothingiisreal/mn-celeste-12b';

-- Delete invalid Hermes 3 8B (only 70B exists on OpenRouter)
DELETE FROM model_parameters WHERE model_identifier = 'nousresearch/hermes-3-llama-3.1-8b';
DELETE FROM model_overrides WHERE model = 'nousresearch/hermes-3-llama-3.1-8b';
DELETE FROM models WHERE model_identifier = 'nousresearch/hermes-3-llama-3.1-8b';

-- Update Fireworks model to use current Llama 3.3 (old Hermes 2 Pro was removed from serverless)
-- Must update in correct order due to FK constraint: models first, then model_parameters

-- 1. Delete old model_parameters first (no FK pointing to it)
DELETE FROM model_parameters WHERE model_identifier = 'accounts/fireworks/models/hermes-2-pro-mistral-7b';

-- 2. Update model_overrides (no FK constraint, just stores the model string)
UPDATE model_overrides SET model = 'accounts/fireworks/models/llama-v3p3-70b-instruct'
WHERE model = 'accounts/fireworks/models/hermes-2-pro-mistral-7b';

-- 3. Update the models table (parent)
UPDATE models SET
  model_identifier = 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  model_name = 'Llama 3.3 70B Instruct',
  context_window = 131072,
  input_price_per_million = 0.90,
  output_price_per_million = 0.90
WHERE model_identifier = 'accounts/fireworks/models/hermes-2-pro-mistral-7b';

-- 4. Re-insert model_parameters for the new model
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('accounts/fireworks/models/llama-v3p3-70b-instruct', 'conversation', 0.7, 4096)
ON CONFLICT (model_identifier, use_case) DO NOTHING;
