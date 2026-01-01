-- Add pending_annotation column to articles table
-- Stores annotation marker position for write-back feature
-- Format: { "headerText": "...", "headerLevel": 2 }

ALTER TABLE articles
ADD COLUMN pending_annotation JSONB DEFAULT NULL;

COMMENT ON COLUMN articles.pending_annotation IS 'Pending annotation marker position for write-back feature';
