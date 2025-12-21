-- Add xAI Grok 4.1 Fast via OpenRouter
-- xAI's latest reasoning model, free tier available

-- Model registration
INSERT INTO models (model_identifier, model_name, provider, model_type, is_active, context_window, input_price_per_million, output_price_per_million)
VALUES ('x-ai/grok-4.1-fast', 'Grok 4.1 Fast', 'openrouter', 'text_generation', true, 131000, 0.00, 0.00);

-- Model parameters (conversation only)
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('x-ai/grok-4.1-fast', 'conversation', 0.7, 8192);
