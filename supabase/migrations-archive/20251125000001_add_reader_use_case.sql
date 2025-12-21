-- Add 'reader' use case parameters (copy from 'conversation' values)
-- Used by: process-article, reader chat endpoints

-- Update CHECK constraint to allow 'reader'
ALTER TABLE model_parameters DROP CONSTRAINT model_parameters_use_case_check;
ALTER TABLE model_parameters ADD CONSTRAINT model_parameters_use_case_check
  CHECK (use_case IN ('conversation', 'compression', 'reader'));

-- Insert reader parameters (copy from conversation)
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking)
SELECT model_identifier, 'reader', temperature, max_tokens, thinking_enabled, max_tokens_thinking
FROM model_parameters
WHERE use_case = 'conversation'
ON CONFLICT (model_identifier, use_case) DO NOTHING;