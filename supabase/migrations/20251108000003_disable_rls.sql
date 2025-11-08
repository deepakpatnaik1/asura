-- Disable RLS for early development
-- This will be re-enabled in production with proper auth

-- Drop all RLS policies on superjournal
DROP POLICY IF EXISTS "Users can view their own superjournal entries" ON public.superjournal;
DROP POLICY IF EXISTS "Users can insert their own superjournal entries" ON public.superjournal;
DROP POLICY IF EXISTS "Users can update their own superjournal entries" ON public.superjournal;
DROP POLICY IF EXISTS "Users can delete their own superjournal entries" ON public.superjournal;

-- Drop all RLS policies on journal
DROP POLICY IF EXISTS "Users can view their own journal entries" ON public.journal;
DROP POLICY IF EXISTS "Users can insert their own journal entries" ON public.journal;
DROP POLICY IF EXISTS "Users can update their own journal entries" ON public.journal;
DROP POLICY IF EXISTS "Users can delete their own journal entries" ON public.journal;

-- Disable RLS on both tables
ALTER TABLE public.superjournal DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal DISABLE ROW LEVEL SECURITY;
