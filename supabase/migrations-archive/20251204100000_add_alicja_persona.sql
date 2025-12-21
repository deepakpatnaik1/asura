-- Add Alicja persona
-- NOTE: mode column and selected_persona_todo are dropped by 20251206000000_simplification.sql

INSERT INTO personas (name, display_name, mode) VALUES
  ('alicja', 'Alicja', 'todo')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS selected_persona_todo TEXT DEFAULT 'alicja';
