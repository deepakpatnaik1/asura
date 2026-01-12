-- Remove tier='canon' - canon is now just an owner value ('everyone'), not a tier
-- Migrate existing canon-tier articles based on whether they have artisan_cut

-- Articles with artisan_cut → strategic tier
UPDATE articles
SET tier = 'strategic'
WHERE tier = 'canon' AND artisan_cut IS NOT NULL;

-- Articles without artisan_cut → ephemeral tier
UPDATE articles
SET tier = 'ephemeral'
WHERE tier = 'canon' AND artisan_cut IS NULL;

-- Ensure all former canon articles now have owner='everyone' if they didn't have an owner
UPDATE articles
SET owner = 'everyone'
WHERE tier IN ('strategic', 'ephemeral')
  AND owner IS NULL;
