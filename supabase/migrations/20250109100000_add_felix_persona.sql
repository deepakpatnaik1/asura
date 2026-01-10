-- Add Felix persona for money to-dos
-- Felix handles financial, bureaucratic, and business admin tasks

-- Insert Felix into personas table
INSERT INTO personas (name, display_name, is_active)
VALUES ('felix', 'Felix', true)
ON CONFLICT (name) DO UPDATE SET display_name = 'Felix', is_active = true;

-- Add model_felix column to user_settings
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS model_felix text;

-- Add compression uncensored flag for Felix
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS compression_uncensored_felix boolean DEFAULT false;
