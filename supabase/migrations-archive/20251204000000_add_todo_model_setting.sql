-- Add selected_todo_model column to user_settings
-- NOTE: This column is dropped by 20251206000000_simplification.sql

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS selected_todo_model TEXT;
