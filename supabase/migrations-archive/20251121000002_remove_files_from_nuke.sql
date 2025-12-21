-- Update nuke function to remove file table references
-- Files system has been removed from the application

CREATE OR REPLACE FUNCTION nuke_all_data()
RETURNS void AS $$
BEGIN
  -- Delete in dependency order (children before parents)
  -- Removed: file_chunks, files (file system deleted)
  DELETE FROM journal WHERE user_id IS NULL;
  DELETE FROM superjournal WHERE user_id IS NULL;
END;
$$ LANGUAGE plpgsql;
