# BUG-028: Supabase Realtime Events Not Broadcasting to Server-Side Subscription

**Date**: 2025-11-13
**Severity**: CRITICAL
**Status**: OPEN

---

## Summary

Supabase Realtime subscription shows `SUBSCRIBED` status but **NO database change events** (INSERT, UPDATE, DELETE) are being received by the server-side subscription in `/api/files/events`.

---

## Observed Behavior

1. SSE endpoint establishes Realtime subscription successfully
2. Subscription status logs: `[SSE] Realtime subscription status: SUBSCRIBED`
3. Database operations (INSERT, UPDATE, DELETE) execute successfully
4. **ZERO `[SSE] Realtime payload received:` logs appear**

---

## Test Evidence

### Test 1: INSERT Event (File Upload)
```bash
# File uploaded: 8ed05356-fb15-4854-8076-d7b0ce50db97
[FileProcessor] File 8ed05356-fb15-4854-8076-d7b0ce50db97 marked complete
❌ NO INSERT event received
❌ NO UPDATE events received during processing
```

### Test 2: UPDATE Event (Second File)
```bash
# File uploaded: d0517c70-3baa-4459-91e0-0f51b959f475
[FileProcessor] File d0517c70-3baa-4459-91e0-0f51b959f475 marked complete
❌ NO INSERT event received
❌ NO UPDATE events received during processing
```

### Test 3: DELETE Event (First File)
```bash
# DELETE API called for: 8ed05356-fb15-4854-8076-d7b0ce50db97
DELETE returned success: {"success":true}
❌ NO DELETE event received
```

### Test 4: Without Filter (Third File)
```bash
# Removed filter entirely from subscription
# File uploaded: c1a6ee06-94ea-4574-b4cc-da3b1192b736
[FileProcessor] File c1a6ee06-94ea-4574-b4cc-da3b1192b736 marked complete
❌ NO INSERT event received (even without filter!)
❌ NO UPDATE events received (even without filter!)
```

**Conclusion**: Filter is NOT the problem. Realtime events are not broadcasting at all.

---

## Environment Details

- **Supabase**: Remote (https://hsxjcowijclwdxcmhbhs.supabase.co)
- **Database**: PostgreSQL via Supabase
- **REPLICA IDENTITY**: FULL (enabled via SQL)
- **RLS**: Disabled (`rowsecurity = false`)
- **Realtime Publication**: `files` table is published
- **Subscription Status**: `SUBSCRIBED`

---

## Subscription Configuration

File: `/src/routes/api/files/events/+server.ts` (lines 87-129)

```typescript
subscription = (supabase as any)
  .channel(`files-${userId}`)  // userId = null
  .on(
    'postgres_changes',
    {
      event: '*',  // Listen to INSERT, UPDATE, DELETE
      schema: 'public',
      table: 'files',
      filter: userId === null ? 'user_id=is.null' : `user_id=eq.${userId}`
    },
    (payload) => {
      console.log('[SSE] Realtime payload received:', JSON.stringify(payload, null, 2));
      // This callback NEVER fires
    }
  )
  .subscribe((status: string) => {
    console.log('[SSE] Realtime subscription status:', status);
    // This logs: SUBSCRIBED
  });
```

---

## Root Cause Hypothesis

### Hypothesis 1: Server-Side Realtime Not Supported
Supabase Realtime may be designed for **client-side (browser)** subscriptions only. Server-side Node.js/SvelteKit subscriptions may not work properly.

**Evidence**:
- Subscription status shows `SUBSCRIBED`
- But event callback never fires
- This suggests WebSocket connection may be established but events aren't flowing

### Hypothesis 2: Realtime Filter Syntax Issue
The filter `user_id=is.null` may not work properly with Realtime subscriptions.

**Counter-evidence**:
- Even INSERT/UPDATE events (which should match any row) don't fire
- Filter syntax follows Supabase documentation

### Hypothesis 3: Remote Supabase Project Configuration
The remote Supabase project may have Realtime disabled or misconfigured.

**Next Steps to Verify**:
- Check Supabase dashboard: Database > Replication
- Verify `files` table has Realtime enabled
- Check for any Realtime-specific RLS policies

---

## Impact

This blocks:
- **BUG-026**: Individual file delete SSE events
- **BUG-012**: Progress bar updates during processing
- **All real-time UI updates** for file operations

Users must manually refresh to see file changes.

---

## Possible Solutions

### Solution 1: Move to Client-Side Realtime ✅ RECOMMENDED
- Remove server-side SSE relay architecture
- Subscribe to Realtime directly from browser (filesStore.ts)
- Simpler architecture, fewer moving parts

**Pros**:
- Supabase Realtime is designed for client-side
- Eliminates server-side SSE complexity
- Likely to work immediately

**Cons**:
- Lose centralized subscription management
- Each browser tab creates separate connection

### Solution 2: Investigate Supabase Dashboard Configuration
- Check if Realtime is enabled for `files` table
- Verify publication settings
- Check for Realtime-specific policies

**Pros**:
- May be simple configuration fix

**Cons**:
- May not solve server-side subscription issue

### Solution 3: Use Polling Instead of Realtime
- Replace SSE with periodic polling (`/api/files` every N seconds)
- Fallback if Realtime can't be made to work

**Pros**:
- Simple, guaranteed to work

**Cons**:
- Higher server load
- Delayed updates
- Not real-time

---

## Investigation Tasks

- [x] Check if files table is in supabase_realtime publication ✅ CONFIRMED
- [ ] Check Supabase dashboard: Database > Replication > files table
- [ ] Test removing filter to see if events arrive
- [x] Search Supabase docs for server-side Realtime examples
- [ ] Check Supabase GitHub issues for similar problems

### Web Search: Server-Side Supabase Realtime Support

**Search Query**: "supabase realtime server-side node.js subscription postgres_changes"

**Date**: 2025-11-13

**Results**:

✅ **Server-side Supabase Realtime IS supported** for Node.js applications

**Key Findings**:

1. **Configuration Required**:
   - Must enable replication in Supabase dashboard (Database > Replication)
   - Must add table to publication: `ALTER PUBLICATION supabase_realtime ADD TABLE your_table;`
   - We already did REPLICA IDENTITY FULL, but may be missing publication step

2. **Production Considerations** (from Medium article):
   - Basic subscriptions can drop every 30 minutes
   - Need to handle all subscription statuses: SUBSCRIBED, TIMED_OUT, CLOSED, CHANNEL_ERROR
   - Recommended to use server-side Realtime and re-stream to clients via Broadcast
   - Clean up channels after use

3. **Common Issues**:
   - Table not added to `supabase_realtime` publication
   - Replication not enabled in dashboard
   - Missing proper error handling for connection drops

**Sources**:
- Official docs: https://supabase.com/docs/guides/realtime/postgres-changes
- Production guide: https://medium.com/@dipiash/supabase-realtime-postgres-changes-in-node-js-2666009230b0
- GitHub: https://github.com/supabase/realtime

**Next Step**: Check if `files` table is added to `supabase_realtime` publication

### Publication Check Results

**Query Run**:
```sql
SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename = 'files';
```

**Result**: ✅ **CONFIRMED - Table IS in publication**
```json
[
  {
    "publication_name": "supabase_realtime",
    "schemaname": "public",
    "tablename": "files"
  }
]
```

**Conclusion**: Publication is correctly configured. The issue must be elsewhere.

### Next Hypothesis: Filter Syntax Issue

The current filter is: `user_id=is.null`

According to Supabase docs, the filter syntax for Realtime may differ from PostgREST. The `is.null` operator might not work in Realtime filters.

**Test**: Remove the filter entirely to see if events arrive without filtering.

---

## Related Files

- [/src/routes/api/files/events/+server.ts](../src/routes/api/files/events/+server.ts) - SSE endpoint
- [/src/lib/stores/filesStore.ts](../src/lib/stores/filesStore.ts) - Frontend store
- [TEST-SSE-DELETE-EVENTS.md](./TEST-SSE-DELETE-EVENTS.md) - Test documentation
- [BUG-026 Documentation](./BUG-026-individual-delete-sse.md) - Related bug

---

## Root Cause: ANON Key vs SERVICE_ROLE Key

**Discovery Date**: 2025-11-13 (after extensive investigation)

**Root Cause Found**: The server-side SSE endpoint was using the **ANON key** (via `$lib/supabase.ts`) instead of the **SERVICE_ROLE key**.

**Why This Matters**:
- Server-side Realtime subscriptions require elevated permissions
- ANON key is designed for client-side (browser) operations
- SERVICE_ROLE key has full database access needed for server-side subscriptions

**Evidence**:
- File: `/src/lib/supabase.ts` uses `PUBLIC_SUPABASE_ANON_KEY`
- Subscription showed `SUBSCRIBED` status (connection worked)
- But NO events were received (permissions insufficient)

**Fix Applied**:
Changed `/src/routes/api/files/events/+server.ts` to:
1. Import `createClient` directly from `@supabase/supabase-js`
2. Create separate `supabaseAdmin` client with `SUPABASE_SERVICE_ROLE_KEY`
3. Use admin client for Realtime subscription

**Next Step**: Test if SERVICE_ROLE key resolves the issue

---

## Test Results: SERVICE_ROLE Key Fix

**Test Date**: 2025-11-13 11:37 AM

**Test File**: `53a438ca-a78f-4c56-b2c2-16b3a6aea697` (service-role-test.txt)

### ✅ INSERT Events: WORKING
```json
{
  "schema": "public",
  "table": "files",
  "commit_timestamp": "2025-11-13T10:37:22.689Z",
  "eventType": "INSERT",
  "new": {
    "id": "53a438ca-a78f-4c56-b2c2-16b3a6aea697",
    "status": "pending",
    "filename": "service-role-test.txt",
    ...
  }
}
```

### ✅ UPDATE Events: WORKING
Multiple UPDATE events received during processing (progress: 0 → 75 → 100)

### ✅ DELETE Events: WORKING
```json
{
  "eventType": "DELETE",
  "old": {
    "id": "53a438ca-a78f-4c56-b2c2-16b3a6aea697"
  }
}
```

**Conclusion**: All Realtime events (INSERT, UPDATE, DELETE) now flow through successfully!

---

## Resolution Summary

### Problem
Server-side Supabase Realtime subscriptions were not receiving any database change events (INSERT, UPDATE, DELETE), despite subscription status showing `SUBSCRIBED`.

### Root Cause
The SSE endpoint was using the **ANON key** (via `$lib/supabase.ts`) instead of the **SERVICE_ROLE key**. Server-side Realtime subscriptions require elevated permissions that only the SERVICE_ROLE key provides.

### Fix Applied
Modified [/src/routes/api/files/events/+server.ts](../src/routes/api/files/events/+server.ts):
1. Created separate `supabaseAdmin` client with SERVICE_ROLE key
2. Used admin client for Realtime subscription instead of default ANON client
3. Added debug logging to trace event flow

### Code Changes
```typescript
// Import SERVICE_ROLE key
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

// Create admin client for server-side Realtime
const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
console.log('[SSE] Using SERVICE_ROLE key for Realtime subscription');

// Use admin client for subscription
subscription = (supabaseAdmin as any).channel(`files-${userId}`)...
```

### Status
✅ **RESOLVED** - All Realtime events now broadcast correctly

This fixes:
- **BUG-026**: Individual file delete SSE events
- **BUG-028**: Realtime events not broadcasting
- **BUG-012**: Progress bar updates during processing (may require additional UI work)

---

## Next Steps

1. ✅ COMPLETED: Identified root cause (ANON vs SERVICE_ROLE key)
2. ✅ COMPLETED: Applied fix to SSE endpoint
3. ✅ COMPLETED: Test all file operations (INSERT, UPDATE, DELETE)
4. ✅ COMPLETED: Document final resolution
5. ⏳ TODO: Test UI updates in browser (file list, progress bars)
6. ⏳ TODO: Verify BUG-012 (progress bars) works end-to-end
7. ⏳ TODO: Re-add filter for user_id once multi-user auth is implemented
