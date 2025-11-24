-- Add alt_text column to article_charts table for programmatic filtering
ALTER TABLE article_charts
ADD COLUMN alt_text TEXT DEFAULT '';

-- Add index for programmatic filtering queries
CREATE INDEX idx_article_charts_alt_text ON article_charts USING gin(to_tsvector('english', alt_text));

-- Comment for documentation
COMMENT ON COLUMN article_charts.alt_text IS 'Alt text from original <img> tag. Used for programmatic filtering to identify ads/banners before AI pass.';
