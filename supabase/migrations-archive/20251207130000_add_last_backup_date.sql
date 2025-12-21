-- Add last_backup_date to track daily backups
-- Backup triggers on first message of each day

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS last_backup_date DATE;
