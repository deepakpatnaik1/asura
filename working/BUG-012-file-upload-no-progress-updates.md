# BUG-012: File Upload - No Progress Updates in UI

## Summary
When uploading a file, the UI remains stuck at "Pending 0%" despite backend successfully processing the file to completion. No real-time progress updates are received by the frontend.

## Status
**ACTIVE** - Bug confirmed via Test 3 (2025-11-12)

## Reproduction Steps
1. Open application at http://localhost:5173
2. Click paper clip icon to open file picker
3. Select a small text file (e.g., gettysburg.txt)
4. Observe the Files dropdown UI

## Expected Behavior
1. File immediately appears in UI with "Pending 0%" status
2. Progress updates via SSE as file processes:
   - 0% → 25% (extraction complete)
   - 25% → 75% (compression complete)
   - 75% → 90% (embedding complete)
   - 90% → 100% (finalization complete)
3. File moves to "READY (1)" section with checkmark
4. Total time: ~10-15 seconds for small text file

## Actual Behavior
1. ✅ File appears in UI with "Pending 0%" status
2. ❌ File remains stuck at "Pending 0%" indefinitely
3. ❌ No progress updates received by UI
4. ✅ Backend processes file successfully (verified in logs)
5. ❌ UI never shows "Ready" status despite backend completion

## Backend Logs Analysis

### Evidence of Successful Processing
```
[FileProcessor] Duplicate file detected (hash: 73203f72...), deleting existing file 04e3426f-32b4-4c31-ade9-5c6c08d11fad
[FileProcessor] Verified: duplicate file successfully deleted 04e3426f-32b4-4c31-ade9-5c6c08d11fad
[FileProcessor] Successfully deleted duplicate file 04e3426f-32b4-4c31-ade9-5c6c08d11fad, proceeding with new upload
[Upload API] File record created with ID: 3a1301df-bdd6-4561-9496-7bac8cffcaaf
[Vectorization] Generating embedding for text: 1863 Gettysburg Address: Three-part dedication of ...
[Vectorization] Successfully generated 1024-dim embedding
[FileProcessor] File 3a1301df-bdd6-4561-9496-7bac8cffcaaf marked complete on attempt 1
```

### What's Working
- ✅ File upload endpoint receives file correctly
- ✅ Duplicate detection and deletion works
- ✅ File record created in database with real ID
- ✅ Text extraction successful
- ✅ Compression (Artisan Cut) successful
- ✅ Embedding generation successful (1024-dim vector)
- ✅ Database marked complete (attempt 1)

### What's NOT Working
- ❌ No SSE event logs visible for file progress updates
- ❌ UI does not receive any `file-update` events
- ❌ filesStore does not update after initial upload
- ❌ No evidence of SSE endpoint sending progress updates

## Initial Observations

### SSE Connection
- SSE connection established on page load:
  ```
  [SSE] Creating Realtime channel: files-public
  [SSE] Channel subscribed successfully
  ```
- Connection appears to be for Supabase Realtime, not custom SSE endpoint
- No logs showing `/api/files/events` SSE endpoint activity

### Hypothesis
The issue appears to be that **progress updates are not being sent via SSE** at all. The backend successfully processes the file and updates the database, but:
1. Either the SSE endpoint is not sending events when database updates occur
2. Or the Supabase Realtime subscription is not configured correctly to listen for `files` table changes
3. Or the frontend is listening to the wrong event source

## Related Issues
- This is the same symptom as **BUG-011: Realtime bindings mismatch**
- Both indicate a disconnect between backend database updates and frontend UI updates

## Affected Files
- `/api/files/events/+server.ts` - SSE endpoint
- `filesStore.ts` - Frontend store with SSE connection management
- `file-processor.ts` - Backend processing that updates database

## Investigation Completed (Test Session 2025-11-12)

### Root Cause Identified
PostgreSQL REPLICA IDENTITY DEFAULT only sends primary key (`id`) in UPDATE replication events.
- Supabase Realtime postgres_changes receives: `{id: "xxx", filename: undefined, status: undefined, progress: undefined}`
- SSE endpoint cannot forward complete file data to frontend
- Frontend receives events but has no data to update UI with

### Failed Fix Attempt #1: REPLICA IDENTITY FULL (Test 4)
**Approach**: `ALTER TABLE public.files REPLICA IDENTITY FULL`
**Rationale**: FULL mode includes all columns in replication events
**Result**: ❌ COMPLETE FAILURE
- Error: "mismatch between server and client bindings for postgres changes"
- Supabase Realtime client bindings incompatible with REPLICA IDENTITY FULL
- File dropdown completely broken (worse than original bug)
**Action**: Reverted via migration `20251112000002_revert_replica_identity.sql`

### Failed Fix Attempt #2: Async Fetch-on-Notify (Test 6)
**Approach**: Made postgres_changes callback `async` and fetch full row on notification
**Code change** (`src/routes/api/files/events/+server.ts` lines 113-156):
```typescript
async (payload) => {  // ❌ BREAKS REALTIME
  if (payload.new?.id) {
    const { data: fullRow } = await supabase
      .from('files')
      .select('*')
      .eq('id', payload.new.id)
      .single();

    sendEvent({ eventType: 'file-update', file: fullRow });
  }
}
```
**Result**: ❌ COMPLETE FAILURE
- Same error: "mismatch between server and client bindings for postgres changes"
- Supabase Realtime does NOT support async event handlers
- Cannot use `await` inside postgres_changes callback
**Action**: Code changes uncommitted, need to revert

### Constraints Discovered
Supabase Realtime postgres_changes does NOT support:
1. REPLICA IDENTITY FULL mode
2. Async event handlers (`async`/`await`)

### Alternative Solutions to Consider
1. **Custom PostgreSQL trigger**: Create trigger that stores full row data in separate notification table
2. **Polling approach**: Replace Realtime with periodic polling from frontend
3. **Backend cache**: Cache full file data in memory, lookup on notification
4. **Supabase Edge Functions**: Use serverless function to fetch and forward data
5. **Separate SSE endpoint**: Implement custom SSE without Supabase Realtime dependency

## Next Steps
1. ⏸️ **STOP** - Revert uncommitted code changes
2. 🔄 **Reset** - Return to commit `73ca8c5` (before failed fixes)
3. 🔍 **Research** - Investigate synchronous solutions that work within Supabase Realtime constraints
4. 💭 **Re-plan** - Choose alternative architecture
5. ⚙️ **Implement** - New approach via Doer agent
6. ✅ **Review** - Via Reviewer agent
7. 🧪 **Test** - Verify fix via systematic testing
8. 📄 **Document** - Update with final resolution

---

**Test Reference**: See `working/TEST-SESSION-2025-11-12.md` - Tests 3, 4, 5, 6
