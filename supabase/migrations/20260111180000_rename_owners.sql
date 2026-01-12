-- Rename owner values: system → no-one, canon → everyone
-- This simplifies the mental model: "No One" and "Everyone" are more intuitive

-- Update articles table
UPDATE articles SET owner = 'no-one' WHERE owner = 'system';
UPDATE articles SET owner = 'everyone' WHERE owner = 'canon';

-- Update superjournal table (persona_name column uses 'system' for file uploads)
-- Keep 'system' for superjournal as it represents system-generated entries, not ownership
-- This is a different concept - system entries vs system owner

-- Update user_settings table
UPDATE user_settings SET last_content_owner = 'no-one' WHERE last_content_owner = 'system';
UPDATE user_settings SET last_content_owner = 'everyone' WHERE last_content_owner = 'canon';
