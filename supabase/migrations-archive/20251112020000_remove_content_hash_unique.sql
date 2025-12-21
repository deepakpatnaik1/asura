-- Remove unique constraint on content_hash
-- This allows multiple users to upload files with the same content_hash
-- Deduplication will be handled at the application level per-user

-- Drop the unique constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'files_content_hash_key'
        AND conrelid = 'public.files'::regclass
    ) THEN
        ALTER TABLE public.files DROP CONSTRAINT files_content_hash_key;
    END IF;
END $$;
