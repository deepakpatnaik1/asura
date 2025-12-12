-- Add Google Gemini 3 Pro Preview for provider testing
-- Released November 2025

-- Model registration
INSERT INTO models (model_identifier, model_name, provider, model_type, is_active, context_window, input_price_per_million, output_price_per_million)
VALUES ('gemini-3-pro-preview-11-2025', 'Gemini 3 Pro Preview', 'google', 'text_generation', true, 200000, 2.00, 12.00);

-- Model parameters (conversation only)
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('gemini-3-pro-preview-11-2025', 'conversation', 0.7, 8192);
