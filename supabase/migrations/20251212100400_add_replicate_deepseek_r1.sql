-- Add DeepSeek R1 via Replicate for provider testing
-- Reasoning model, strong at analysis and logic

-- Model registration
INSERT INTO models (model_identifier, model_name, provider, model_type, is_active, context_window, input_price_per_million, output_price_per_million)
VALUES ('deepseek-ai/deepseek-r1', 'DeepSeek R1', 'replicate', 'text_generation', true, 64000, 0.55, 2.19);

-- Model parameters (conversation only)
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('deepseek-ai/deepseek-r1', 'conversation', 0.7, 8192);
