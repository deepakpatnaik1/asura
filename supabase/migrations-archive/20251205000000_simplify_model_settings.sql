-- Simplify model settings: merge conversation+compression into chat, rename todo to work
--
-- Before: selected_conversation_model, selected_compression_model, selected_reader_model, selected_todo_model
-- After:  selected_chat_model, selected_reader_model, selected_work_model

-- Add new columns
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS selected_chat_model TEXT,
ADD COLUMN IF NOT EXISTS selected_work_model TEXT;

-- Migrate data (only if old columns exist)
DO $$
BEGIN
  -- Migrate conversation model to chat model
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'user_settings' AND column_name = 'selected_conversation_model') THEN
    UPDATE user_settings
    SET selected_chat_model = selected_conversation_model
    WHERE selected_chat_model IS NULL AND selected_conversation_model IS NOT NULL;
  END IF;

  -- Migrate todo model to work model
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'user_settings' AND column_name = 'selected_todo_model') THEN
    UPDATE user_settings
    SET selected_work_model = selected_todo_model
    WHERE selected_work_model IS NULL AND selected_todo_model IS NOT NULL;
  END IF;
END $$;

-- Drop old columns
ALTER TABLE user_settings
DROP COLUMN IF EXISTS selected_conversation_model,
DROP COLUMN IF EXISTS selected_compression_model,
DROP COLUMN IF EXISTS selected_todo_model;
