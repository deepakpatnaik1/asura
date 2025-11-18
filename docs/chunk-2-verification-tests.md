# Chunk 2 Verification Tests

**Purpose**: Verify database migration completed successfully with proper user_id backfill, constraints, and vector search function fixes.

**Execute these tests IMMEDIATELY after Chunk 2 migration completes.**

---

## Test 1: Verify NULL Backfill Completed

**Purpose**: Ensure ALL NULL user_id values have been backfilled (either deleted or assigned to admin).

**Current State** (pre-migration):
- superjournal: 6 NULL user_id rows
- journal: 6 NULL user_id rows
- files: 1 NULL user_id row
- file_chunks: 3 NULL user_id rows
- user_settings: 0 NULL user_id rows (already has values)

**Test SQL**:
```sql
-- Count NULL user_id values across all tables
SELECT 'superjournal' as table_name, COUNT(*) as null_count
FROM superjournal WHERE user_id IS NULL
UNION ALL
SELECT 'journal', COUNT(*) FROM journal WHERE user_id IS NULL
UNION ALL
SELECT 'files', COUNT(*) FROM files WHERE user_id IS NULL
UNION ALL
SELECT 'file_chunks', COUNT(*) FROM file_chunks WHERE user_id IS NULL
UNION ALL
SELECT 'user_settings', COUNT(*) FROM user_settings WHERE user_id IS NULL;
```

**Expected Result**:
```
table_name     | null_count
---------------|------------
superjournal   | 0
journal        | 0
files          | 0
file_chunks    | 0
user_settings  | 0
```

**Pass Criteria**: ALL null_count values MUST be 0.

**If Test Fails**: Migration backfill incomplete. DO NOT PROCEED. Fix backfill and re-run migration.

---

## Test 2: Verify NOT NULL Constraints Added

**Purpose**: Ensure user_id columns have NOT NULL constraint to prevent future NULL insertions.

**Test SQL**:
```sql
SELECT
  table_name,
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'user_id'
  AND table_name IN ('superjournal', 'journal', 'files', 'user_settings', 'file_chunks')
ORDER BY table_name;
```

**Expected Result**:
```
table_name     | column_name | is_nullable
---------------|-------------|-------------
file_chunks    | user_id     | NO
files          | user_id     | NO
journal        | user_id     | NO
superjournal   | user_id     | NO
user_settings  | user_id     | NO
```

**Pass Criteria**: ALL is_nullable values MUST be 'NO'.

**If Test Fails**: NOT NULL constraints not applied. Risk of NULL insertions. Fix migration.

---

## Test 3: Verify Foreign Key Constraints with CASCADE

**Purpose**: Ensure user_id columns reference auth.users(id) with ON DELETE CASCADE.

**Test SQL**:
```sql
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
  AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND kcu.column_name = 'user_id'
ORDER BY tc.table_name;
```

**Expected Result**:
```
table_name     | column_name | foreign_table_name | foreign_column_name | delete_rule
---------------|-------------|--------------------|--------------------|-------------
file_chunks    | user_id     | auth.users         | id                  | CASCADE
files          | user_id     | auth.users         | id                  | CASCADE
journal        | user_id     | auth.users         | id                  | CASCADE
superjournal   | user_id     | auth.users         | id                  | CASCADE
user_settings  | user_id     | auth.users         | id                  | CASCADE
```

**Pass Criteria**: ALL delete_rule values MUST be 'CASCADE'.

**If Test Fails**: CASCADE delete will not work. User deletion will fail or leave orphaned data.

---

## Test 4: Verify Vector Search Function Fixed

**Purpose**: Ensure `search_journal_by_embedding()` function no longer has `OR j.user_id IS NULL` clause.

**Test SQL**:
```sql
-- Get function definition
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'search_journal_by_embedding';
```

**Pass Criteria**:
1. Function definition MUST contain: `(user_id_filter IS NULL OR j.user_id = user_id_filter)`
2. Function definition MUST NOT contain: `OR j.user_id IS NULL`

**Manual Verification**:
```sql
-- Search the function source for the problematic clause
SELECT pg_get_functiondef(oid) LIKE '%OR j.user_id IS NULL%' AS has_security_issue
FROM pg_proc
WHERE proname = 'search_journal_by_embedding';
```

**Expected Result**: `has_security_issue = false`

**If Test Fails**: Security vulnerability still present. Vector search will leak data across users.

---

## Test 5: Test CASCADE Delete End-to-End

**Purpose**: Verify that deleting a user from auth.users CASCADE deletes all related data.

**IMPORTANT**: Only run this test with a TEST USER. DO NOT use real user data.

**Test Procedure**:

```sql
-- Step 1: Create test user (use Supabase Auth Admin API or dashboard)
-- Assume test user ID: '00000000-0000-0000-0000-000000000TEST'

-- Step 2: Insert test data
INSERT INTO superjournal (user_id, user_message, ai_response, persona_name)
VALUES ('00000000-0000-0000-0000-000000000TEST', 'test message', 'test response', 'gunnar');

INSERT INTO journal (user_id, boss_essence, persona_essence, decision_arc_summary, salience_score)
VALUES ('00000000-0000-0000-0000-000000000TEST', 'test boss', 'test persona', 'test arc', 5);

INSERT INTO files (user_id, filename, file_type, content_hash, status, progress)
VALUES ('00000000-0000-0000-0000-000000000TEST', 'test.pdf', 'pdf', 'test-hash', 'ready', 100)
RETURNING id;
-- Note the returned file_id for verification

INSERT INTO user_settings (user_id, selected_persona)
VALUES ('00000000-0000-0000-0000-000000000TEST', 'gunnar');

-- Step 3: Verify data exists
SELECT 'superjournal' as table_name, COUNT(*) FROM superjournal WHERE user_id = '00000000-0000-0000-0000-000000000TEST'
UNION ALL
SELECT 'journal', COUNT(*) FROM journal WHERE user_id = '00000000-0000-0000-0000-000000000TEST'
UNION ALL
SELECT 'files', COUNT(*) FROM files WHERE user_id = '00000000-0000-0000-0000-000000000TEST'
UNION ALL
SELECT 'user_settings', COUNT(*) FROM user_settings WHERE user_id = '00000000-0000-0000-0000-000000000TEST';
-- Expected: All counts > 0

-- Step 4: Delete test user from auth.users (CASCADE should trigger)
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000TEST';

-- Step 5: Verify ALL data CASCADE deleted
SELECT 'superjournal' as table_name, COUNT(*) FROM superjournal WHERE user_id = '00000000-0000-0000-0000-000000000TEST'
UNION ALL
SELECT 'journal', COUNT(*) FROM journal WHERE user_id = '00000000-0000-0000-0000-000000000TEST'
UNION ALL
SELECT 'files', COUNT(*) FROM files WHERE user_id = '00000000-0000-0000-0000-000000000TEST'
UNION ALL
SELECT 'file_chunks', COUNT(*) FROM file_chunks WHERE user_id = '00000000-0000-0000-0000-000000000TEST'
UNION ALL
SELECT 'user_settings', COUNT(*) FROM user_settings WHERE user_id = '00000000-0000-0000-0000-000000000TEST';
```

**Expected Result**: ALL counts in Step 5 MUST be 0.

**Pass Criteria**: Deleting user from auth.users automatically deletes all related data from all tables.

**If Test Fails**: CASCADE delete not working. Orphaned data will accumulate. DO NOT PROCEED.

---

## Test 6: Test Vector Search User Isolation

**Purpose**: Verify vector search does NOT return other users' journal entries.

**Prerequisites**: Need 2 test users with journal entries containing embeddings.

**Test Procedure**:

```javascript
// Run via Node.js script with Supabase client

// User A creates journal entry
const { data: entryA } = await supabase
  .rpc('search_journal_by_embedding', {
    query_embedding: JSON.stringify(Array(1024).fill(0.1)),
    match_count: 50,
    exclude_ids: [],
    user_id_filter: 'USER_A_ID'
  });

console.log('User A sees entries:', entryA.map(e => e.user_id));
// Expected: ALL entries have user_id = 'USER_A_ID' (no User B entries)

// User B searches
const { data: entryB } = await supabase
  .rpc('search_journal_by_embedding', {
    query_embedding: JSON.stringify(Array(1024).fill(0.1)),
    match_count: 50,
    exclude_ids: [],
    user_id_filter: 'USER_B_ID'
  });

console.log('User B sees entries:', entryB.map(e => e.user_id));
// Expected: ALL entries have user_id = 'USER_B_ID' (no User A entries)

// Check for cross-contamination
const userASeesUserB = entryA.some(e => e.user_id === 'USER_B_ID');
const userBSeesUserA = entryB.some(e => e.user_id === 'USER_A_ID');

console.log('User A sees User B data:', userASeesUserB); // MUST be false
console.log('User B sees User A data:', userBSeesUserA); // MUST be false
```

**Pass Criteria**:
- User A MUST ONLY see their own journal entries
- User B MUST ONLY see their own journal entries
- NO cross-user data leakage

**If Test Fails**: CRITICAL SECURITY VULNERABILITY. Vector search leaking data across users. DO NOT PROCEED.

---

## Summary Checklist

After Chunk 2 migration, verify ALL tests pass:

- [ ] Test 1: NULL backfill complete (0 NULL values in all tables)
- [ ] Test 2: NOT NULL constraints added (all is_nullable = 'NO')
- [ ] Test 3: Foreign keys with CASCADE created (all delete_rule = 'CASCADE')
- [ ] Test 4: Vector search function fixed (no `OR j.user_id IS NULL` clause)
- [ ] Test 5: CASCADE delete works end-to-end (test user deletion removes all data)
- [ ] Test 6: Vector search isolated per user (no cross-user leakage)

**ALL tests MUST pass before proceeding to Chunk 3 (RLS policies).**

---

**Created**: 2025-01-18
**For**: Chunk 2 - Database Migration Verification
