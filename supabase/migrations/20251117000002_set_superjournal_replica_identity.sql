-- Set REPLICA IDENTITY FULL for superjournal table
-- Required for Supabase Realtime to broadcast DELETE events
-- Without this, PostgreSQL publications can't send DELETE events because they
-- only have the primary key, but Realtime needs all column values

ALTER TABLE public.superjournal REPLICA IDENTITY FULL;
