-- Add artisan_cut_at column to track when artisan cut was generated
-- Used for linked files to detect staleness (compare against file mtime)

ALTER TABLE articles ADD COLUMN IF NOT EXISTS artisan_cut_at TIMESTAMPTZ;

-- Backfill existing artisan cuts with created_at timestamp
UPDATE articles
SET artisan_cut_at = created_at
WHERE artisan_cut IS NOT NULL AND artisan_cut_at IS NULL;
