-- Add is_protected column for nuke immunity
-- Protected files can only be manually deleted from the content library

ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_protected BOOLEAN DEFAULT FALSE;
