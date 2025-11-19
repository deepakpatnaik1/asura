-- Insert Claude Sonnet 4.5 model record
-- Part of Sonnet 4.5 Megafeature: Chunk 1

INSERT INTO models (
  model_identifier,
  model_name,
  context_window,
  input_price_per_million,
  output_price_per_million
)
VALUES (
  'claude-sonnet-4-5-20250929',
  'Claude Sonnet 4.5',
  200000,
  3.00,
  15.00
)
ON CONFLICT (model_identifier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  context_window = EXCLUDED.context_window,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million;
