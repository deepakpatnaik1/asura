-- Fix BUG-002: Token usage should persist when conversations are deleted
-- Token usage is accounting data (billing records), not conversation data
-- When user nukes conversations, we should preserve cost tracking

-- Step 1: Drop the existing foreign key constraint with CASCADE
ALTER TABLE token_usage
  DROP CONSTRAINT IF EXISTS token_usage_conversation_id_fkey;

-- Step 2: Make conversation_id nullable (allow orphaned billing records)
ALTER TABLE token_usage
  ALTER COLUMN conversation_id DROP NOT NULL;

-- Step 3: Add new foreign key constraint with SET NULL on delete
ALTER TABLE token_usage
  ADD CONSTRAINT token_usage_conversation_id_fkey
  FOREIGN KEY (conversation_id)
  REFERENCES superjournal(id)
  ON DELETE SET NULL;

-- Result: When superjournal records are deleted (via nuke or individual deletion),
-- the token_usage records persist with conversation_id = NULL, preserving billing history
