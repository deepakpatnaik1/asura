-- Create atomic nuke function for single-user mode
-- Deletes all user data in a single transaction

CREATE OR REPLACE FUNCTION nuke_all_data()
RETURNS void AS $$
BEGIN
  -- Delete in dependency order (children before parents)
  DELETE FROM file_chunks WHERE user_id IS NULL;
  DELETE FROM files WHERE user_id IS NULL;
  DELETE FROM journal WHERE user_id IS NULL;
  DELETE FROM superjournal WHERE user_id IS NULL;
END;
$$ LANGUAGE plpgsql;
