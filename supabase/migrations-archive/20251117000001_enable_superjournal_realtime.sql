-- Enable Supabase Realtime for superjournal table
-- Required for SSE broadcasts of message deletion events

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'superjournal') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.superjournal;
    END IF;
END $$;
