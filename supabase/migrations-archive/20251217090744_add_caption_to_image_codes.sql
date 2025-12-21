-- Add caption column to image_codes table
-- This ties the auto-generated caption to the image permanently

ALTER TABLE image_codes
ADD COLUMN caption TEXT;

COMMENT ON COLUMN image_codes.caption IS 'Auto-generated description of the image from JoyCaption';
