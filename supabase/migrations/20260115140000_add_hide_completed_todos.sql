-- Add hide_completed_todos setting for Felix's todo visibility control
-- UI-only filter: hides completed todos from CalendarCanvas, but Felix still sees them

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS hide_completed_todos BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN user_settings.hide_completed_todos IS 'When true, completed todos are hidden from the Calendar canvas UI (Felix can still see them via tools)';
