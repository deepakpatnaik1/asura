-- Update default models to Claude Sonnet 4.5
-- Part of Sonnet 4.5 Megafeature: Make Sonnet 4.5 the default for all users

-- Update existing user_settings records to use Sonnet 4.5
-- Only updates records that still have the old Qwen defaults
UPDATE user_settings
SET selected_conversation_model = 'claude-sonnet-4-5-20250929'
WHERE selected_conversation_model = 'accounts/fireworks/models/qwen3-235b-a22b';

UPDATE user_settings
SET selected_compression_model = 'claude-sonnet-4-5-20250929'
WHERE selected_compression_model = 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507';

-- Note: This migration only updates records with old defaults
-- Users who explicitly changed their model selection will keep their choice
