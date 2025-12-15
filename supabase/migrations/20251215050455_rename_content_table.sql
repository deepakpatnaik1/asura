-- Rename content table to canvas_gallery_content
ALTER TABLE content RENAME TO canvas_gallery_content;

-- Add comment
COMMENT ON TABLE canvas_gallery_content IS 'Gallery content - pasted articles and files for AI context';
