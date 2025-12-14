-- Add can_compress boolean to models table
-- Determines which models can perform Artisan Cut compression
-- Models with can_compress = false store verbatim turns (still get embeddings)

-- Step 1: Add the column with default false
ALTER TABLE models ADD COLUMN IF NOT EXISTS can_compress BOOLEAN DEFAULT false;

-- Step 2: Set can_compress = true for Anthropic models (all Claude models can compress)
UPDATE models SET can_compress = true WHERE provider = 'anthropic';

-- Step 3: Set can_compress = true for Hermes 3 70B (tested to produce valid JSON)
UPDATE models SET can_compress = true WHERE model_identifier = 'nousresearch/hermes-3-llama-3.1-70b';
