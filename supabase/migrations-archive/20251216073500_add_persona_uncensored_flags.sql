-- Per-persona flags for uncensored compression model usage
-- When true, use model_chat_compression_uncensored instead of model_chat_compression

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS compression_uncensored_gunnar BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS compression_uncensored_kirby BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS compression_uncensored_samara BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS compression_uncensored_alicja BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS compression_uncensored_eva BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS compression_uncensored_ananya BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN user_settings.compression_uncensored_eva IS 'Eva defaults to uncensored compression for NSFW content';
