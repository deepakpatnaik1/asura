-- Migration: Rename tier values for consistency
-- ephemeral → raw (no AI processing)
-- strategic → artisan_cut (AI compression applied)
-- canon → removed (use owner='everyone' instead)

-- Drop old constraint
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_tier_check;

-- Update existing records
UPDATE articles SET tier = 'raw' WHERE tier = 'ephemeral';
UPDATE articles SET tier = 'artisan_cut' WHERE tier = 'strategic';
UPDATE articles SET tier = 'raw' WHERE tier = 'canon'; -- canon files become raw (they're already compact)

-- Add new constraint with updated values
ALTER TABLE articles ADD CONSTRAINT articles_tier_check
  CHECK (tier = ANY (ARRAY['raw'::text, 'artisan_cut'::text]));

-- Add comment for documentation
COMMENT ON COLUMN articles.tier IS 'Processing level: raw (no AI), artisan_cut (AI compressed)';
