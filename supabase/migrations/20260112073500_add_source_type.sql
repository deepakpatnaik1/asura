-- Add source_type column to track content origin (text, pdf, image)
-- This enables filtering/nuking by content type

ALTER TABLE articles ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'text';

-- Update existing images (identified by raw_content pattern)
UPDATE articles SET source_type = 'image' WHERE raw_content LIKE '[Uploaded image:%';

-- Note: Existing PDFs can't be retroactively identified - they'll remain as 'text'
-- Future PDF uploads will be marked as 'pdf'
