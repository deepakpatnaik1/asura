-- Add Nico persona for Discord engagement
-- Nico is the Discord equivalent of Ananya (Reddit)

-- Insert Nico into personas table (or update if joel exists)
INSERT INTO personas (name, display_name, is_active)
VALUES ('nico', 'Nico', true)
ON CONFLICT (name) DO UPDATE SET display_name = 'Nico';

-- Remove joel if it exists (renamed to nico)
DELETE FROM personas WHERE name = 'joel';

-- Add model_nico column to user_settings
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS model_nico text;

-- Add compression uncensored flag for Nico
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS compression_uncensored_nico boolean DEFAULT false;

-- Clean up old joel columns if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'model_joel') THEN
        ALTER TABLE user_settings DROP COLUMN model_joel;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'compression_uncensored_joel') THEN
        ALTER TABLE user_settings DROP COLUMN compression_uncensored_joel;
    END IF;
END $$;
