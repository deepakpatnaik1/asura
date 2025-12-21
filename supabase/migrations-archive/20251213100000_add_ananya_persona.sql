-- Add Ananya persona to personas table
-- Part of Ananya persona build (2025-12-13)

INSERT INTO personas (name, display_name) VALUES
  ('ananya', 'Ananya')
ON CONFLICT (name) DO NOTHING;
