-- Remove Fireworks models (hard delete)
-- Part of Fireworks removal: Clean slate for Anthropic-only architecture

DELETE FROM models
WHERE provider = 'fireworks';

-- KEEP provider column (needed for future multi-provider support)
-- KEEP models table structure (needed for adding new providers)
