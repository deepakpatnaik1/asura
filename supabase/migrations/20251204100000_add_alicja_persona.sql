-- Add Alicja persona for todo mode

INSERT INTO personas (name, display_name, mode) VALUES
  ('alicja', 'Alicja', 'todo')
ON CONFLICT (name) DO NOTHING;

-- Add selected_persona_todo column to user_settings (if not exists)
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS selected_persona_todo TEXT DEFAULT 'alicja';
