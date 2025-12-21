-- Add Eva persona to personas table
INSERT INTO personas (name, display_name, is_active)
VALUES ('eva', 'Eva', true)
ON CONFLICT (name) DO NOTHING;

-- Add model_eva column to user_settings if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_settings' AND column_name = 'model_eva'
    ) THEN
        ALTER TABLE user_settings ADD COLUMN model_eva TEXT;
    END IF;
END $$;
