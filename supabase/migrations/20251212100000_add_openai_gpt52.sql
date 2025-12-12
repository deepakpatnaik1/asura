-- Add OpenAI GPT-5.2 Instant for provider testing
-- Released December 11, 2025 - cheapest GPT-5.2 variant

-- Model registration
INSERT INTO models (model_identifier, model_name, provider, model_type, is_active, context_window, input_price_per_million, output_price_per_million)
VALUES ('gpt-5.2-chat-latest', 'GPT-5.2 Instant', 'openai', 'text_generation', true, 400000, 1.75, 14.00);

-- Model parameters (conversation only)
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('gpt-5.2-chat-latest', 'conversation', 0.7, 8192);
