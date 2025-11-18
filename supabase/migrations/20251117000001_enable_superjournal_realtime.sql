-- Enable Supabase Realtime for superjournal table
-- Required for SSE broadcasts of message deletion events

ALTER PUBLICATION supabase_realtime ADD TABLE public.superjournal;
