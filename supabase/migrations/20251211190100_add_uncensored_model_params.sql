-- Add model_parameters for uncensored models so they work properly

-- Celeste 12B
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('nothingiisreal/mn-celeste-12b', 'conversation', 0.9, 4096)
ON CONFLICT (model_identifier, use_case) DO NOTHING;

-- Lumimaid 70B
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('neversleep/llama-3-lumimaid-70b', 'conversation', 0.9, 4096)
ON CONFLICT (model_identifier, use_case) DO NOTHING;

-- Dolphin Venice (free)
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('cognitivecomputations/dolphin-mistral-24b-venice-edition:free', 'conversation', 0.9, 4096)
ON CONFLICT (model_identifier, use_case) DO NOTHING;
