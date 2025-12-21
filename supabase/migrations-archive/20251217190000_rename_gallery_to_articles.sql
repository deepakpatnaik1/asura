-- Rename gallery tables to articles
-- canvas_gallery_content -> articles
-- canvas_gallery_charts -> article_charts

-- Rename the content table (if exists)
ALTER TABLE IF EXISTS canvas_gallery_content RENAME TO articles;

-- Rename the charts table (if exists)
ALTER TABLE IF EXISTS canvas_gallery_charts RENAME TO article_charts;

-- Note: Foreign key constraint update skipped - tables may not exist in fresh DB
