-- Rename gallery tables to articles
-- canvas_gallery_content -> articles
-- canvas_gallery_charts -> article_charts

-- Rename the content table
ALTER TABLE canvas_gallery_content RENAME TO articles;

-- Rename the charts table
ALTER TABLE canvas_gallery_charts RENAME TO article_charts;

-- Update foreign key constraint name for clarity
ALTER TABLE article_charts
  DROP CONSTRAINT IF EXISTS canvas_gallery_charts_content_id_fkey;

ALTER TABLE article_charts
  ADD CONSTRAINT article_charts_content_id_fkey
  FOREIGN KEY (content_id) REFERENCES articles(id) ON DELETE CASCADE;
