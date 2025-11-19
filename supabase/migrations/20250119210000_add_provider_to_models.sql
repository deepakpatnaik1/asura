-- Add provider column to models table
-- Part of Sonnet 4.5 Megafeature: Chunk 1 fix

ALTER TABLE models
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'fireworks';

-- Update existing Fireworks models
UPDATE models SET provider = 'fireworks' WHERE model_identifier LIKE 'accounts/fireworks/%';

-- Update Anthropic Claude models
UPDATE models SET provider = 'anthropic' WHERE model_identifier LIKE 'claude-%';

-- Remove default after backfilling
ALTER TABLE models ALTER COLUMN provider DROP DEFAULT;
