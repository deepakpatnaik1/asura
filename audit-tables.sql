-- Audit existing e-reader tables and storage bucket configuration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/hsxjcowijclwdxcmhbhs/sql

-- ============================================================
-- PART 1: Check if tables exist and their structure
-- ============================================================

-- Articles table structure
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'articles'
ORDER BY ordinal_position;

-- Article_chat table structure
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'article_chat'
ORDER BY ordinal_position;

-- ============================================================
-- PART 2: Check indexes on these tables
-- ============================================================

-- Indexes on articles table
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'articles';

-- Indexes on article_chat table
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'article_chat';

-- ============================================================
-- PART 3: Check RLS policies
-- ============================================================

-- RLS policies on articles table
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'articles';

-- RLS policies on article_chat table
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'article_chat';

-- ============================================================
-- PART 4: Check storage buckets and policies
-- ============================================================

-- List all storage buckets
SELECT
    id,
    name,
    public,
    created_at
FROM storage.buckets;

-- List all storage policies (check pg_policies for storage objects)
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';

-- ============================================================
-- PART 5: Sample data counts
-- ============================================================

-- Count of articles
SELECT COUNT(*) as article_count FROM articles;

-- Count of article_chat messages
SELECT COUNT(*) as message_count FROM article_chat;
