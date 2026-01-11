-- Nuke System Refactor: Remove obsolete tiers (gettysburg, scan)
-- 
-- This migration:
-- 1. Migrates any existing gettysburg content to strategic
-- 2. Migrates any existing scan content to ephemeral
-- 3. Updates the tier constraint to only allow: ephemeral, strategic, canon

-- First, migrate any existing data
UPDATE articles SET tier = 'strategic' WHERE tier = 'gettysburg';
UPDATE articles SET tier = 'ephemeral' WHERE tier = 'scan';

-- Drop existing constraint and add new one
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_tier_check;
ALTER TABLE articles ADD CONSTRAINT articles_tier_check
  CHECK (tier IN ('ephemeral', 'strategic', 'canon'));

COMMENT ON COLUMN articles.tier IS 'Content tier: ephemeral (raw, no artisan cut), strategic (has artisan cut), canon (foundational)';
