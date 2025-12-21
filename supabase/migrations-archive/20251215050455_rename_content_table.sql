-- Rename content table to canvas_gallery_content (if exists)
ALTER TABLE IF EXISTS content RENAME TO canvas_gallery_content;

-- Add comment only if table was renamed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'canvas_gallery_content') THEN
    COMMENT ON TABLE canvas_gallery_content IS 'Gallery content - pasted articles and files for AI context';
  END IF;
END $$;
