-- Add uncensored compression model column for Eva persona
-- Allows NSFW content compression without Claude Haiku refusing

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS model_chat_compression_uncensored TEXT
DEFAULT 'nousresearch/hermes-3-llama-3.1-70b';

COMMENT ON COLUMN user_settings.model_chat_compression_uncensored IS 'Model for compressing NSFW chat content (Eva persona)';
