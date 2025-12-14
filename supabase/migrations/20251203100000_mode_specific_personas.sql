-- Add persona columns to user_settings
-- NOTE: These columns are dropped by 20251206000000_simplification.sql

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS selected_persona_chat TEXT DEFAULT 'gunnar',
ADD COLUMN IF NOT EXISTS selected_persona_reader TEXT DEFAULT 'samara';

-- Migrate existing data
UPDATE user_settings
SET selected_persona_chat = COALESCE(selected_persona, 'gunnar')
WHERE selected_persona IS NOT NULL;

ALTER TABLE user_settings DROP COLUMN IF EXISTS selected_persona;
