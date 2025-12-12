-- Add Llama 4 Maverick via Groq for provider testing
-- MoE architecture: 17B active parameters, 400B total, 128K context

-- Model registration
INSERT INTO models (model_identifier, model_name, provider, model_type, is_active, context_window, input_price_per_million, output_price_per_million)
VALUES ('meta-llama/llama-4-maverick-17b-128e-instruct', 'Llama 4 Maverick', 'groq', 'text_generation', true, 131000, 0.20, 0.60);

-- Model parameters (conversation only)
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('meta-llama/llama-4-maverick-17b-128e-instruct', 'conversation', 0.7, 8192);
