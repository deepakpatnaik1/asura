-- Add source_path column to articles table for live-linking to Obsidian files
-- When set, content is read from disk on display instead of from raw_content

ALTER TABLE articles ADD COLUMN source_path TEXT;

-- Add comment for documentation
COMMENT ON COLUMN articles.source_path IS 'Absolute path to source file (e.g., Obsidian vault). When set, content is read fresh from disk on display.';
