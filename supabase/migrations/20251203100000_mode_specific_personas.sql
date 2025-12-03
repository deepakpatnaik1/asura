-- Add mode-specific persona columns to user_settings
-- Replaces single selected_persona with separate columns for chat and reader modes

-- Add new columns with appropriate defaults
ALTER TABLE user_settings
ADD COLUMN selected_persona_chat TEXT DEFAULT 'gunnar',
ADD COLUMN selected_persona_reader TEXT DEFAULT 'samara';

-- Migrate existing data: copy selected_persona to chat column (it was always chat persona)
UPDATE user_settings
SET selected_persona_chat = COALESCE(selected_persona, 'gunnar');

-- Drop the old column
ALTER TABLE user_settings DROP COLUMN IF EXISTS selected_persona;

-- Add comments
COMMENT ON COLUMN user_settings.selected_persona_chat IS 'Selected persona for chat mode (gunnar or kirby)';
COMMENT ON COLUMN user_settings.selected_persona_reader IS 'Selected persona for reader mode (samara)';
