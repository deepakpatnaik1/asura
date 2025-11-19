#!/bin/bash

# Chunk 3 RLS Verification Script
# This script verifies that Row-Level Security is properly enabled and working

set -e  # Exit on error

echo "================================"
echo "Chunk 3 RLS Verification Script"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

echo "Step 1: Check RLS is enabled on all tables"
echo "-------------------------------------------"
psql "$DB_URL" -c "
SELECT
  tablename,
  CASE WHEN rowsecurity THEN '✅ ENABLED' ELSE '❌ DISABLED' END AS rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('superjournal', 'journal', 'files', 'file_chunks', 'user_settings', 'models')
ORDER BY tablename;
"

echo ""
echo "Step 2: Count existing RLS policies"
echo "------------------------------------"
psql "$DB_URL" -c "
SELECT
  tablename,
  COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('superjournal', 'journal', 'files', 'file_chunks', 'user_settings', 'models')
GROUP BY tablename
ORDER BY tablename;
"

echo ""
echo "Step 3: List all RLS policies"
echo "------------------------------"
psql "$DB_URL" -c "
SELECT
  tablename,
  policyname,
  cmd AS operation,
  SUBSTRING(qual::text, 1, 50) || '...' AS policy_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('superjournal', 'journal', 'files', 'file_chunks', 'user_settings', 'models')
ORDER BY tablename, cmd, policyname;
"

echo ""
echo "Step 4: Check current data has user_id set"
echo "--------------------------------------------"
psql "$DB_URL" -c "
SELECT
  'superjournal' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(user_id) AS rows_with_user_id,
  COUNT(*) - COUNT(user_id) AS rows_with_null_user_id
FROM superjournal
UNION ALL
SELECT
  'journal',
  COUNT(*),
  COUNT(user_id),
  COUNT(*) - COUNT(user_id)
FROM journal
UNION ALL
SELECT
  'files',
  COUNT(*),
  COUNT(user_id),
  COUNT(*) - COUNT(user_id)
FROM files
UNION ALL
SELECT
  'user_settings',
  COUNT(*),
  COUNT(user_id),
  COUNT(*) - COUNT(user_id)
FROM user_settings;
"

echo ""
echo "${GREEN}✅ Verification complete!${NC}"
echo ""
echo "Next steps:"
echo "1. If RLS is DISABLED on any table, run migration: npx supabase db push"
echo "2. If rows have NULL user_id, they will be invisible to authenticated users"
echo "3. Test with actual user sessions to verify isolation"
