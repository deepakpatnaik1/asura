-- Add 'scan' tier for scanned document uploads
-- Used by Felix persona for receipts, invoices, letters, etc.

-- Drop the existing constraint
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_tier_check;

-- Add new constraint including 'scan' tier
ALTER TABLE articles ADD CONSTRAINT articles_tier_check
CHECK (tier = ANY (ARRAY['ephemeral'::text, 'strategic'::text, 'canon'::text, 'gettysburg'::text, 'scan'::text]));
