-- Drop unused columns from charts table

ALTER TABLE charts DROP COLUMN IF EXISTS anthropic_file_id;
ALTER TABLE charts DROP COLUMN IF EXISTS anthropic_file_created_at;
ALTER TABLE charts DROP COLUMN IF EXISTS is_relevant;
