-- Add is_canon column to content table
-- Canon content is shared knowledge accessible to all personas

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'content') THEN
        ALTER TABLE content ADD COLUMN IF NOT EXISTS is_canon BOOLEAN NOT NULL DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_content_is_canon ON content(user_id, is_canon) WHERE is_canon = TRUE;
        COMMENT ON COLUMN content.is_canon IS 'Canon content is shared knowledge accessible to all personas';
    END IF;
END $$;
