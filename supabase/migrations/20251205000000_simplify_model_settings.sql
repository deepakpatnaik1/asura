-- Simplify model settings: merge conversation+compression into chat, rename todo to work
--
-- Before: selected_conversation_model, selected_compression_model, selected_reader_model, selected_todo_model
-- After:  selected_chat_model, selected_reader_model, selected_work_model

-- Add new columns
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS selected_chat_model TEXT,
ADD COLUMN IF NOT EXISTS selected_work_model TEXT;

-- Migrate data: conversation model becomes chat model
UPDATE user_settings
SET selected_chat_model = selected_conversation_model
WHERE selected_chat_model IS NULL AND selected_conversation_model IS NOT NULL;

-- Migrate data: todo model becomes work model
UPDATE user_settings
SET selected_work_model = selected_todo_model
WHERE selected_work_model IS NULL AND selected_todo_model IS NOT NULL;

-- Drop old columns
ALTER TABLE user_settings
DROP COLUMN IF EXISTS selected_conversation_model,
DROP COLUMN IF EXISTS selected_compression_model,
DROP COLUMN IF EXISTS selected_todo_model;
