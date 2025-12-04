-- Add Alicja persona for todo mode

INSERT INTO personas (name, display_name, mode) VALUES
  ('alicja', 'Alicja', 'todo');

-- Add selected_persona_todo column to user_settings
ALTER TABLE user_settings
ADD COLUMN selected_persona_todo TEXT DEFAULT 'alicja';

COMMENT ON COLUMN user_settings.selected_persona_todo IS 'Selected persona for todo mode (alicja)';
