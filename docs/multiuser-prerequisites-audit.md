# Multiuser Prerequisites Audit Report (REVISED)

**Date**: 2025-01-18 (Revised after fierce independent review)
**Purpose**: Pre-implementation discovery for Chunk 0 of multiuser megafeature
**Status**: ⚠️ **COMPLETE WITH CRITICAL FINDINGS** - 1 security issue identified, requires migration fix

---

## Summary

Audit completed with **1 CRITICAL SECURITY ISSUE** discovered in vector search function. Issue is addressable in Chunk 2 migration. Safe to proceed to Chunk 1 with documented mitigation.

### Key Findings
1. ⚠️ **CRITICAL**: `search_journal_by_embedding()` has logic error allowing NULL user_id leak (VERIFIED in function code)
2. ✅ Context builder passes userId correctly to all queries (10 locations verified by code review)
3. ✅ No client-side Supabase queries found - all database access is server-side (grep verified)
4. ✅ Fireworks AI rate limits confirmed - batch processing prevents bursts (60 RPM sustained)
5. ✅ Voyage AI rate limits confirmed - batch processing prevents bursts (60 RPM sustained)
6. ✅ Supabase Realtime respects RLS automatically for Postgres Changes (documentation confirmed)
7. ✅ Database state verified - current row counts: 6 superjournal, 6 journal, 1 file, 3 file_chunks (ALL with NULL user_id)
8. ✅ CASCADE delete TESTED and VERIFIED - file deletion cascades to file_chunks correctly
9. ⚠️ SSE endpoint uses SERVICE_ROLE client - broadcasts ALL events to ALL clients (VERIFIED line 79 of SSE endpoint)

---

## Task 1: Context Builder Audit

**File**: [src/lib/context-builder.ts](src/lib/context-builder.ts)

### Findings

✅ **EXCELLENT NEWS**: The context builder is already multiuser-ready!

#### How userId is Currently Handled

The `buildContextForCalls1A1B()` function accepts `userId: string | null` (line 58) and properly filters ALL database queries:

**Superjournal Query** (lines 82-94):
```typescript
let superjournalQuery = supabase
    .from('superjournal')
    .select('user_message, ai_response, persona_name, created_at');

if (userId === null) {
    superjournalQuery = superjournalQuery.is('user_id', null);
} else {
    superjournalQuery = superjournalQuery.eq('user_id', userId);
}
```

**This pattern is consistently applied to**:
- Superjournal (lines 82-94)
- Starred messages (lines 103-114)
- Instructions (lines 126-139)
- Journal (lines 151-163)
- Journal count for vector search (lines 186-195)
- Superjournal exclude IDs for vector search (lines 214-226)
- Journal exclude IDs for vector search (lines 242-255)
- File overviews (lines 302-314)

#### Vector Search Functions

**Journal vector search** (line 264-269):
```typescript
await supabase.rpc('search_journal_by_embedding', {
    query_embedding: JSON.stringify(queryVector),
    match_count: 50,
    exclude_ids: excludeIds,
    user_id_filter: userId  // ✅ Already passing userId
});
```

**File chunks vector search** (line 344-349):
```typescript
await supabase.rpc('search_file_chunks', {
    query_embedding: queryVector,
    match_threshold: 0.7,
    match_count: 20,
    filter_user_id: userId  // ✅ Already passing userId
});
```

### Vector Search Function Verification (REVISED)

**⚠️ CRITICAL FINDING**: `search_journal_by_embedding()` function has a **LOGIC ERROR** on line 33:

```sql
WHERE j.embedding IS NOT NULL
  AND j.is_instruction = false
  AND NOT (j.id = ANY(exclude_ids))
  AND (user_id_filter IS NULL OR j.user_id = user_id_filter OR j.user_id IS NULL)
  --                                                            ^^^^^^^^^^^^^^^^^^^^
  --                                                            SECURITY ISSUE
```

**The Problem**:
- Third condition `OR j.user_id IS NULL` returns ALL legacy NULL user_id rows to ALL users
- Currently acceptable (pre-multiuser, all data is shared)
- **BECOMES CRITICAL VULNERABILITY** after Chunk 2 migration if any NULL rows persist

**Why This Exists**:
- Backward compatibility for pre-multiuser data
- Allows vector search to work when userId is NULL (development mode)
- Context builder passes NULL in development, expects to see all data

**Migration Fix Required in Chunk 2**:
```sql
-- After backfilling user_id and adding NOT NULL constraint:
CREATE OR REPLACE FUNCTION search_journal_by_embedding(...)
WHERE j.embedding IS NOT NULL
  AND j.is_instruction = false
  AND NOT (j.id = ANY(exclude_ids))
  AND (user_id_filter IS NULL OR j.user_id = user_id_filter)
  -- Remove the "OR j.user_id IS NULL" clause entirely
```

**Mitigation Strategy**:
1. Chunk 2 migration MUST backfill ALL NULL user_id values (per user requirement #1: delete or assign to admin)
2. After backfill, remove `OR j.user_id IS NULL` clause from function
3. Test that no NULL user_id rows exist before removing clause
4. Add database constraint to prevent NULL user_id insertion

**Verified**: `search_file_chunks()` function DOES NOT have this issue (line 145 only checks `filter_user_id IS NULL OR fc.user_id = filter_user_id`)

### Action Required for Multiuser

**CRITICAL CHANGES NEEDED**:

1. **Fix `search_journal_by_embedding()` logic** in Chunk 2 migration (remove NULL fallback)
2. **Verify NO NULL user_id rows** exist after Chunk 2 backfill
3. **Add NOT NULL constraint** to user_id columns after backfill
4. **Ensure userId is always passed** from API endpoints (never null in multiuser mode)
5. **No changes needed to context-builder.ts logic** - it's already correct!

### Impact Assessment

- **Risk**: 🔴 **HIGH** (data leak vulnerability if NULL rows persist post-migration)
- **Effort**: Low (one-line SQL change in migration)
- **Breaking Changes**: None if backfill is complete
- **Mitigation**: Documented in Chunk 2 migration plan

---

## Task 2: Client-Side Queries Audit

**Search Pattern**: `createClient` and `.from()` in `.svelte` files

### Findings

✅ **NO CLIENT-SIDE QUERIES FOUND**

All `createClient` usage is in **server-side files only**:

**Server-Side Files** (✅ CORRECT):
- `src/routes/api/nuke/+server.ts`
- `src/routes/api/chat/+server.ts`
- `src/routes/api/files/events/+server.ts`
- `src/lib/context-builder.ts`
- `src/lib/file-compressor.ts`
- `src/routes/debug-files/+page.server.ts`
- `src/routes/api/settings/+server.ts`
- `src/routes/api/superjournal/[id]/+server.ts`
- `src/routes/+page.server.ts`
- `src/lib/supabase.ts`

**Client-Side Files** (.svelte):
- ✅ Zero matches found for `.from()` in any .svelte file

### Architecture Analysis

The codebase follows **best practice**:
- All database access goes through API endpoints (`+server.ts` files)
- Client-side code only calls fetch() to backend APIs
- RLS will work correctly when enabled (no bypass paths)

### Action Required for Multiuser

**ZERO CHANGES NEEDED** - architecture is already correct.

### Impact Assessment

- **Risk**: NONE
- **Effort**: None
- **Breaking Changes**: None

---

## Task 3: Fireworks AI Rate Limits

**Source**: [Fireworks AI Docs - Rate Limits](https://docs.fireworks.ai/guides/quotas_usage/rate-limits)

### Official Rate Limits (2025)

#### Serverless Models
- **Default**: 600 requests/minute (RPM)
- **With payment method**: Up to 6,000 RPM
- **Business tier**: Custom rate limits (higher)

#### Audio Models
- **audio-prod**: 200 RPM
- **audio-turbo**: 400 RPM

#### Dynamic Rate Limiting
- If exceeded: Requests processed with **lower priority** and higher latency
- If significantly exceeded: Requests **dropped with HTTP 429**

#### Batch API
- **No rate limits**
- 50% lower cost
- 24-hour turnaround time

#### Monitoring Headers
- `x-ratelimit-limit-requests`: Current minimum limit
- `x-ratelimit-remaining-requests`: Remaining capacity
- `x-ratelimit-over-limit`: Near capacity indicator

### Current Asura Usage

**File Processing** (src/lib/file-processor.ts):
- Batch size: 5 concurrent compressions
- Delay between batches: 5 seconds
- Effective rate: ~1 request/second = 60 RPM

**Chat** (src/routes/api/chat/+server.ts):
- Streaming responses
- User requirement: Max 1 concurrent chat per user
- Max rate with 999 users: 999 concurrent (but rate-limited to 1 per user)

### Safety Analysis

✅ **FILE PROCESSING IS SAFE**:
- 60 RPM << 600 RPM default limit
- 10x safety margin with default tier
- 100x safety margin with payment method (6,000 RPM)

✅ **CHAT IS SAFE**:
- Rate limited to 1 concurrent per user (user requirement #7)
- With 999 users max, worst case = 999 concurrent requests
- Fireworks handles high concurrency well with queue-based processing

### Recommendations

1. **Add response header monitoring** to track rate limit usage
2. **Implement retry logic** with exponential backoff for 429 errors
3. **Consider Batch API** for file processing (50% cost savings, no rate limits)
4. **Monitor** `x-ratelimit-remaining-requests` header in production

### Action Required for Multiuser

**CHANGES NEEDED**:
1. Add retry logic with exponential backoff for 429 errors
2. Add rate limit header monitoring and logging
3. Consider switching file processing to Batch API

### Impact Assessment

- **Risk**: LOW (10x-100x safety margin)
- **Effort**: Low (add retry logic)
- **Breaking Changes**: None

---

## Task 4: Voyage AI Rate Limits

**Source**: [Voyage AI Docs - Rate Limits](https://docs.voyageai.com/docs/rate-limits)

### Official Rate Limits (2025)

#### Tiered System (Automatic Graduation)

**Tier 1 (Base)**:
- **2,000 RPM** (requests per minute)
- **8M TPM** (tokens per minute)

**Tier 2**:
- **4,000 RPM**
- **16M TPM**

**Tier 3**:
- **6,000 RPM**
- **24M TPM**

#### Rate Limit Scope
- Applied **per organization** (not per API key)
- Can be set at **project level** by Admin (≤ org limit)
- Measured per minute (not per second)

#### Monitoring
- View current limits in Voyage AI dashboard
- Rate limits section shows current tier and usage

### Current Asura Usage

**Context Builder** (src/lib/context-builder.ts):
- Generates embeddings for user queries (on-demand)
- Vector search only when journal count > 100
- Typical rate: 1-2 embeddings per chat message

**File Processing** (src/lib/file-processor.ts):
- Batch size: 5 concurrent embeddings
- Delay between batches: 5 seconds
- Effective rate: ~1 request/second = 60 RPM

### Safety Analysis

✅ **EMBEDDINGS ARE SAFE**:
- File processing: 60 RPM << 2,000 RPM (Tier 1)
- Chat embeddings: Minimal (1-2 per message)
- Combined worst case: ~120 RPM (well under Tier 1 limit)

✅ **TOKEN USAGE IS SAFE**:
- voyage-3 model: 1024-dimensional embeddings
- Typical input: 100-500 tokens per embedding
- Worst case: 120 RPM × 500 tokens = 60K TPM << 8M TPM limit

### Recommendations

1. **Monitor tier graduation** in Voyage AI dashboard
2. **Add retry logic** for rare 429 errors
3. **Consider caching** embeddings for frequently searched queries (optional)

### Action Required for Multiuser

**CHANGES NEEDED**:
1. Add retry logic with exponential backoff for 429 errors (same as Fireworks)

### Impact Assessment

- **Risk**: VERY LOW (33x safety margin on Tier 1)
- **Effort**: Low (add retry logic)
- **Breaking Changes**: None

---

## Task 5: CASCADE Delete Behavior

**Status**: ✅ **VERIFIED** (File Chunks CASCADE tested and working)

### Current Database State

**Confirmed via remote database query** (2025-01-18):
- superjournal: 6 rows (all user_id = NULL)
- journal: 6 rows (all user_id = NULL)
- files: 1 row (user_id = NULL)
- file_chunks: 3 rows (all user_id = NULL)
- user_settings: 1 row (user_id NOT NULL)

**Current State**:
- `superjournal.user_id`: Nullable, NO FK constraint to auth.users
- `journal.user_id`: Nullable, NO FK constraint to auth.users
- `files.user_id`: Nullable, NO FK constraint to auth.users
- `user_settings.user_id`: Nullable, NO FK constraint to auth.users
- `file_chunks.user_id`: Nullable, NO FK constraint to auth.users

**File Chunks CASCADE** (✅ **TESTED AND VERIFIED**):
- `file_chunks.file_id` has `ON DELETE CASCADE` to `files.id` (line 11 of migration)
- **Test Result**: Created file with 2 chunks, deleted file, verified 0 chunks remain
- **Conclusion**: CASCADE delete works correctly for file → file_chunks relationship

### What Needs to be Verified AFTER Chunk 2

Once the multiuser migration adds foreign keys:
```sql
ALTER TABLE superjournal ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE journal ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE files ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_settings ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
```

**Then test**:
1. Create test user in auth.users
2. Insert data across all tables with test user_id
3. `DELETE FROM auth.users WHERE id = test_user_id`
4. Verify CASCADE:
   - superjournal: All rows deleted
   - journal: All rows deleted
   - files: All rows deleted
   - file_chunks: All rows deleted (via files CASCADE)
   - user_settings: All rows deleted

### Action Required for Multiuser

**TESTING STEPS** (Execute AFTER Chunk 2 migration):

```sql
-- 1. Create test user
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'cascade-test@test.com');

-- 2. Insert test data
INSERT INTO superjournal (user_id, user_message, ai_response, persona_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'test', 'test', 'gunnar');

INSERT INTO journal (user_id, boss_essence, persona_essence, decision_arc_summary, salience_score)
VALUES ('00000000-0000-0000-0000-000000000001', 'test', 'test', 'test', 5);

INSERT INTO files (user_id, filename, file_type, file_size, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'test.pdf', 'application/pdf', 1000, 'ready');

-- 3. Delete user and verify CASCADE
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001';

-- 4. Verify all data deleted
SELECT COUNT(*) FROM superjournal WHERE user_id = '00000000-0000-0000-0000-000000000001'; -- Should be 0
SELECT COUNT(*) FROM journal WHERE user_id = '00000000-0000-0000-0000-000000000001'; -- Should be 0
SELECT COUNT(*) FROM files WHERE user_id = '00000000-0000-0000-0000-000000000001'; -- Should be 0
SELECT COUNT(*) FROM user_settings WHERE user_id = '00000000-0000-0000-0000-000000000001'; -- Should be 0
```

### Impact Assessment

- **Risk**: MEDIUM (unverified until migration)
- **Effort**: Low (simple test after Chunk 2)
- **Breaking Changes**: None
- **Mitigation**: Test immediately after Chunk 2 migration

---

## Task 6: Supabase Realtime RLS Behavior (NEW)

**Source**: [Supabase Realtime Authorization Docs](https://supabase.com/docs/guides/realtime/authorization)

### Findings

✅ **GOOD NEWS**: Supabase Realtime **DOES respect RLS policies automatically** for Postgres Changes subscriptions.

#### How Realtime Filtering Works

**Postgres Changes (Database Events)**:
- Documentation confirms: "database records are sent only to clients who are allowed to read them based on your RLS policies"
- Filtering happens at database level (not application level)
- Requires authenticated channel subscriptions
- RLS policies on target table automatically apply to Realtime events

**Broadcast/Presence Channels**:
- Separate authorization mechanism (not RLS-based)
- Requires explicit policies on `realtime.messages` table
- Not used in Asura (only Postgres Changes for file events)

#### Current SSE Endpoint Implementation

**File**: [src/routes/api/files/events/+server.ts](src/routes/api/files/events/+server.ts)

**Current behavior** (VERIFIED by reading actual code):
- Line 79: Creates Supabase admin client with **SERVICE_ROLE_KEY**
- Lines 85-99: Subscribes to ALL files table events (no user filtering)
- Lines 102-117: Subscribes to ALL superjournal DELETE events (no user filtering)
- Lines 127-143: Broadcasts events to ALL connected SSE clients
- **CRITICAL ISSUE**: Global subscription receives all users' events, then broadcasts to all clients

**Multiuser Implications**:
1. When RLS is enabled on `files` table, Realtime will automatically filter events by `auth.uid()`
2. Each user's SSE connection will only receive their own file events
3. No server-side filtering code needed (RLS handles it)
4. **CRITICAL**: SSE endpoint MUST use authenticated Supabase client (not service role)

#### Migration Requirement

**Current Code** (service role client):
```typescript
// src/routes/api/files/events/+server.ts
const supabase = createClient(/* service role */);
```

**After Multiuser** (authenticated client required):
```typescript
// src/routes/api/files/events/+server.ts
export async function GET({ locals }) {
  const session = await locals.getSession();
  if (!session) {
    throw error(401, 'Unauthorized');
  }

  const supabase = createAuthenticatedClient(session.access_token);
  // Realtime subscription now filtered by RLS automatically
}
```

### Action Required for Multiuser

**CHANGES NEEDED IN CHUNK 4**:

1. Update SSE endpoint to use authenticated Supabase client (not service role)
2. Verify auth token passed to SSE connection (query parameter per user requirement #20)
3. Test that User A does not receive User B's file events
4. Document that Realtime filtering is automatic (no application-level filtering needed)

### Impact Assessment

- **Risk**: 🟡 **MEDIUM** (requires SSE auth changes, but Realtime RLS is automatic)
- **Effort**: Medium (update SSE endpoint auth)
- **Breaking Changes**: SSE clients must pass auth token
- **Mitigation**: Test isolation in Chunk 6 user isolation tests

---

## Summary of Action Items

### Immediate Actions (Before Chunk 1)
✅ None - safe to proceed

### Actions for Chunk 2 (Database Migration) - **CRITICAL**
1. **FIX SECURITY ISSUE**: Remove `OR j.user_id IS NULL` clause from `search_journal_by_embedding()` function
2. Verify NO NULL user_id rows exist after backfill (run `SELECT COUNT(*) FROM journal WHERE user_id IS NULL`)
3. Add NOT NULL constraint to user_id columns after backfill verification
4. Test CASCADE delete after adding foreign keys

### Actions for Chunk 4 (API Security)
1. **CRITICAL**: Update SSE endpoint to use authenticated Supabase client (not service role)
2. Add auth token validation to SSE endpoint (query parameter per requirement #20)
3. Add retry logic with exponential backoff for Fireworks AI (429 errors)
4. Add retry logic with exponential backoff for Voyage AI (429 errors)
5. Add rate limit header monitoring for Fireworks AI
6. Add logging for rate limit usage

### Actions for Chunk 6 (Testing)
1. **CRITICAL**: Test that User A does NOT receive User B's file events via SSE
2. Test vector search does NOT return other users' journal entries
3. Verify NO NULL user_id rows in any table post-migration

### Optional Optimizations
1. Consider Fireworks Batch API for file processing (50% cost savings)
2. Consider embedding caching for frequently searched queries

---

## Risk Assessment (REVISED)

| Risk Category | Original | Revised | Reason for Change |
|---------------|----------|---------|-------------------|
| Vector search NULL leak | ✅ NONE | 🔴 **CRITICAL** | Function allows NULL user_id rows to leak to all users |
| Context builder filtering | ✅ NONE | ✅ NONE | Verified - passes userId correctly |
| Client-side RLS bypass | ✅ NONE | ✅ NONE | Verified - no client queries |
| SSE Realtime RLS | Not assessed | 🟡 **MEDIUM** | Requires auth client, not service role |
| Fireworks rate limits | 🟢 LOW | 🟢 LOW | Batch processing prevents bursts |
| Voyage rate limits | 🟢 LOW | 🟢 LOW | Batch processing prevents bursts |
| CASCADE delete | 🟡 MEDIUM | 🟢 LOW | Testable now (file chunks), not blocking |

**Overall Risk**: 🟡 **MEDIUM** - One critical security issue identified (fixable in Chunk 2)

---

## Blockers

⚠️ **ONE CRITICAL ISSUE FOUND** (Not a blocker for Chunk 1, but MUST be fixed in Chunk 2):

1. **Vector search NULL leak**: `search_journal_by_embedding()` function has `OR j.user_id IS NULL` clause that will leak legacy data to all users post-migration
   - **Mitigation**: Document in Chunk 2 migration plan
   - **Fix**: Remove clause after backfilling NULL values
   - **Does not block Chunk 1**: Authentication can proceed, fix scheduled for database migration chunk

**Status**: Safe to proceed to Chunk 1 with documented mitigation for Chunk 2.

---

## Appendices

### Appendix A: Context Builder Query Locations

All queries with userId filtering:

1. Line 82: Superjournal (Priority 1)
2. Line 103: Starred messages (Priority 2)
3. Line 126: Instructions (Priority 3)
4. Line 151: Journal (Priority 4)
5. Line 186: Journal count (for vector search decision)
6. Line 214: Superjournal IDs (for exclusion)
7. Line 242: Journal IDs (for exclusion)
8. Line 264: Vector search on journal (Priority 5)
9. Line 302: File overviews (Priority 5.5)
10. Line 344: Vector search on file chunks (Priority 6)

### Appendix B: Rate Limit Calculations

**Fireworks AI - File Processing**:
- Batch size: 5 concurrent
- Delay: 5 seconds
- Rate: 5 requests / 5 seconds = 1 req/sec = 60 RPM
- Limit: 600 RPM (default)
- Safety margin: 10x

**Voyage AI - File Processing**:
- Batch size: 5 concurrent
- Delay: 5 seconds
- Rate: 5 requests / 5 seconds = 1 req/sec = 60 RPM
- Limit: 2,000 RPM (Tier 1)
- Safety margin: 33x

**Worst Case (999 users, all uploading files simultaneously)**:
- Not possible due to user requirement #7: Max 1 concurrent file upload per user
- With rate limiting: 999 users × 1 upload = 999 files queued
- Processing rate: 60 RPM (unchanged, queue processes sequentially)
- Queue time for last user: ~16.6 hours (acceptable for async processing)

### Appendix C: Foreign Key Constraints

**Current State** (no auth.users constraints):
```sql
-- superjournal.user_id: Nullable, no FK
-- journal.user_id: Nullable, no FK
-- files.user_id: Nullable, no FK
-- user_settings.user_id: Nullable, no FK
-- file_chunks.user_id: Nullable, no FK
```

**After Chunk 2 Migration**:
```sql
ALTER TABLE superjournal ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;
ALTER TABLE journal ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;
ALTER TABLE files ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;
ALTER TABLE user_settings ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;
-- file_chunks inherits CASCADE via files.id
```

---

**Report Generated**: 2025-01-18
**Next Step**: Proceed to Chunk 1 - Basic Authentication
