-- Migration: Remove can_compress column, add chat compression model setting
-- All personas now use compression with a dedicated compression model

-- Remove can_compress from models table
ALTER TABLE models DROP COLUMN IF EXISTS can_compress;

-- Add chat compression model column to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS model_chat_compression TEXT DEFAULT 'claude-opus-4-5-20251101';
