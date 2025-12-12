-- Drop legacy duplicate pricing columns from models table
-- The current code uses input_price_per_million and output_price_per_million instead

ALTER TABLE models DROP COLUMN IF EXISTS cost_per_million_input_tokens;
ALTER TABLE models DROP COLUMN IF EXISTS cost_per_million_output_tokens;
