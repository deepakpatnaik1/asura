-- Add is_canon column to content table
-- Canon content gets injected into ALL context builds regardless of mode

ALTER TABLE content
ADD COLUMN is_canon BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for efficient canon content queries
CREATE INDEX idx_content_is_canon ON content(user_id, is_canon) WHERE is_canon = TRUE;

COMMENT ON COLUMN content.is_canon IS 'Canon content is injected into all context builds across all modes (shared knowledge)';
