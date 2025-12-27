-- Drop is_canon column from articles table
-- The tier column is now the single source of truth for content classification
-- tier = 'canon' replaces is_canon = true

ALTER TABLE articles DROP COLUMN IF EXISTS is_canon;
