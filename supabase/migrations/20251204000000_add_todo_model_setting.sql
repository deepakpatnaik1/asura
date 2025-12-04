-- Add selected_todo_model column to user_settings
-- Used for todo mode conversations

ALTER TABLE user_settings
ADD COLUMN selected_todo_model TEXT;

-- Comment for documentation
COMMENT ON COLUMN user_settings.selected_todo_model IS 'Model identifier for todo mode conversations';
