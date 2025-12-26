-- Add tier column to articles table
-- Replaces derived logic from artisan_cut/is_canon with explicit tier

-- Add the column (nullable first for backfill)
ALTER TABLE public.articles
ADD COLUMN tier text;

-- Backfill existing rows based on current derived logic:
-- - is_canon = true → 'canon'
-- - artisan_cut IS NOT NULL AND is_canon = false → 'strategic'
-- - artisan_cut IS NULL → 'ephemeral'
UPDATE public.articles SET tier =
  CASE
    WHEN is_canon = true THEN 'canon'
    WHEN artisan_cut IS NOT NULL THEN 'strategic'
    ELSE 'ephemeral'
  END;

-- Now make it NOT NULL with default
ALTER TABLE public.articles
ALTER COLUMN tier SET NOT NULL,
ALTER COLUMN tier SET DEFAULT 'ephemeral';

-- Add check constraint for valid values
ALTER TABLE public.articles
ADD CONSTRAINT articles_tier_check
CHECK (tier IN ('ephemeral', 'strategic', 'canon', 'gettysburg'));

-- Add index for nuke queries
CREATE INDEX idx_articles_tier ON public.articles(user_id, tier);

COMMENT ON COLUMN public.articles.tier IS 'Content tier: ephemeral (unprocessed), strategic (processed), canon (foundational), gettysburg (design review)';
