-- Add OpenAI GPT-OSS-120B via Together AI for provider testing
-- OpenAI's open-weight 117B MoE model (5.1B active), Apache 2.0 license

-- Model registration
INSERT INTO models (model_identifier, model_name, provider, model_type, is_active, context_window, input_price_per_million, output_price_per_million)
VALUES ('openai/gpt-oss-120b', 'GPT-OSS 120B', 'together', 'text_generation', true, 131000, 0.16, 0.60);

-- Model parameters (conversation only)
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens)
VALUES ('openai/gpt-oss-120b', 'conversation', 0.7, 8192);
