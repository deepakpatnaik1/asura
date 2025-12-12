-- Fix invalid Hermes 3 model ID
-- OpenRouter doesn't have an 8B version, only 70B and 405B
-- Change to 70B version which has function calling support

-- Must delete dependent records first due to FK constraint
DELETE FROM model_parameters
WHERE model_identifier = 'nousresearch/hermes-3-llama-3.1-8b';

-- Update any model_overrides that might reference the old model
UPDATE model_overrides
SET model = 'nousresearch/hermes-3-llama-3.1-70b'
WHERE model = 'nousresearch/hermes-3-llama-3.1-8b';

-- Update model record
UPDATE models
SET model_identifier = 'nousresearch/hermes-3-llama-3.1-70b',
    model_name = 'Nous Hermes 3 Llama 3.1 70B',
    context_window = 131072,
    input_price_per_million = 0.40,
    output_price_per_million = 0.40
WHERE model_identifier = 'nousresearch/hermes-3-llama-3.1-8b';

-- Re-insert model_parameters for the new model
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('nousresearch/hermes-3-llama-3.1-70b', 'conversation', 0.8, 4096)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;

INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('nousresearch/hermes-3-llama-3.1-70b', 'compression', 0.3, 2048)
ON CONFLICT (model_identifier, use_case) DO UPDATE SET
  temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens;
