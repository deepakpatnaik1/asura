-- Consolidate model overrides into user_settings table
-- Model overrides are user settings and belong in one table

-- 1. ADD MODEL COLUMNS TO USER_SETTINGS
-- Personas
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_gunnar TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_kirby TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_samara TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_alicja TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_eva TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_ananya TEXT;

-- Processes
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_embeddings TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_image_gen TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_captioning TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_image_edit TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_audio_gen TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_video_gen TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_compression TEXT;

-- 2. MIGRATE DATA FROM MODEL_OVERRIDES TO USER_SETTINGS (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'model_overrides') THEN
        -- Migrate persona overrides
        UPDATE user_settings us SET model_gunnar = mo.model
        FROM model_overrides mo WHERE mo.user_id = us.user_id AND mo.persona = 'gunnar';

        UPDATE user_settings us SET model_kirby = mo.model
        FROM model_overrides mo WHERE mo.user_id = us.user_id AND mo.persona = 'kirby';

        UPDATE user_settings us SET model_samara = mo.model
        FROM model_overrides mo WHERE mo.user_id = us.user_id AND mo.persona = 'samara';

        UPDATE user_settings us SET model_alicja = mo.model
        FROM model_overrides mo WHERE mo.user_id = us.user_id AND mo.persona = 'alicja';

        UPDATE user_settings us SET model_eva = mo.model
        FROM model_overrides mo WHERE mo.user_id = us.user_id AND mo.persona = 'eva';

        UPDATE user_settings us SET model_ananya = mo.model
        FROM model_overrides mo WHERE mo.user_id = us.user_id AND mo.persona = 'ananya';

        -- Migrate process overrides
        UPDATE user_settings us SET model_embeddings = mo.model
        FROM model_overrides mo WHERE mo.user_id = us.user_id AND mo.persona = 'embeddings';

        UPDATE user_settings us SET model_image_gen = mo.model
        FROM model_overrides mo WHERE mo.user_id = us.user_id AND mo.persona = 'image_gen';

        UPDATE user_settings us SET model_captioning = mo.model
        FROM model_overrides mo WHERE mo.user_id = us.user_id AND mo.persona = 'captioning';

        UPDATE user_settings us SET model_image_edit = mo.model
        FROM model_overrides mo WHERE mo.user_id = us.user_id AND mo.persona = 'image_edit';

        UPDATE user_settings us SET model_audio_gen = mo.model
        FROM model_overrides mo WHERE mo.user_id = us.user_id AND mo.persona = 'audio_gen';

        UPDATE user_settings us SET model_video_gen = mo.model
        FROM model_overrides mo WHERE mo.user_id = us.user_id AND mo.persona = 'video_gen';

        UPDATE user_settings us SET model_compression = mo.model
        FROM model_overrides mo WHERE mo.user_id = us.user_id AND mo.persona = 'compression';
    END IF;
END $$;

-- 3. MIGRATE LEGACY COLUMNS (if they exist)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'selected_embedding_model') THEN
        UPDATE user_settings
        SET model_embeddings = selected_embedding_model
        WHERE model_embeddings IS NULL AND selected_embedding_model IS NOT NULL;

        ALTER TABLE user_settings DROP COLUMN selected_embedding_model;
    END IF;

    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'file_artisan_model') THEN
        UPDATE user_settings
        SET model_compression = file_artisan_model
        WHERE model_compression IS NULL AND file_artisan_model IS NOT NULL;

        ALTER TABLE user_settings DROP COLUMN file_artisan_model;
    END IF;
END $$;

-- 4. DROP MODEL_OVERRIDES TABLE (if exists)
DROP TABLE IF EXISTS model_overrides;
