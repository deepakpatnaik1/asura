-- Create personas table as single source of truth for AI personas
-- Replaces hardcoded PERSONAS config in personas.ts

CREATE TABLE IF NOT EXISTS personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,           -- 'gunnar', 'kirby', 'samara'
  display_name TEXT NOT NULL,          -- 'Gunnar', 'Kirby', 'Samara'
  mode TEXT NOT NULL,                  -- 'chat' or 'reader'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;

-- Everyone can read personas (no user_id column - global data)
CREATE POLICY "Anyone can read personas"
  ON personas FOR SELECT
  USING (true);

-- Seed data
INSERT INTO personas (name, display_name, mode) VALUES
  ('gunnar', 'Gunnar', 'chat'),
  ('kirby', 'Kirby', 'chat'),
  ('samara', 'Samara', 'reader');

COMMENT ON TABLE personas IS 'AI personas available in the system';
COMMENT ON COLUMN personas.name IS 'Lowercase identifier used in code';
COMMENT ON COLUMN personas.display_name IS 'Human-readable name shown in UI';
-- mode column is dropped by later migration (20251206000000_simplification.sql)
