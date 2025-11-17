# TEST: SSE DELETE Events End-to-End

**Date**: 2025-11-13
**Bug Reference**: BUG-026 (Individual file delete SSE events)
**Related**: BUG-027 (REPLICA IDENTITY architectural fix)

---

## Test Objective

Verify that individual file deletion triggers SSE events that flow through the entire architecture:

```
User clicks delete
  → DELETE API call (/api/files/[id])
    → Database DELETE operation
      → PostgreSQL Realtime (via REPLICA IDENTITY FULL)
        → Supabase Realtime subscription (server-side)
          → SSE broadcast to browser
            → filesStore.ts receives event
              → UI updates (file removed from list)
```

---

## Architecture Status

### ✅ Verified Working:
1. **Browser → SSE Connection**: Browser console shows `[Files Store] SSE connected`
2. **Server → Supabase Realtime**: Server logs show:
   - `[SSE] Setting up Realtime subscription for channel: files-null`
   - `[SSE] Realtime subscription status: SUBSCRIBED`
3. **REPLICA IDENTITY**: Enabled FULL on `files` table
4. **RLS**: Disabled (verified `rowsecurity = false`)
5. **Realtime Publication**: `files` table is published

### ❓ Not Yet Tested:
- Whether DELETE events trigger `[SSE] Realtime payload received:` logs
- Whether SSE events reach browser (filesStore.ts)
- Whether UI updates automatically

---

## Test Plan

### Step 1: Upload Test File
1. Upload a test file named `delete-test.txt`
2. Wait for it to reach `ready` status
3. Note the file ID from UI or server logs

### Step 2: Monitor Logs
Open two terminals:
- **Terminal 1**: Server logs (already running: `npm run dev`)
- **Terminal 2**: Browser console (Playwright or Chrome DevTools)

### Step 3: Perform Delete
1. Click individual delete (trash icon) on `delete-test.txt`
2. Confirm deletion in modal
3. **Watch both logs simultaneously**

### Expected Logs:

**Server (Terminal 1)**:
```
[SSE] Realtime payload received: {
  "eventType": "DELETE",
  "old": {
    "id": "<file-id>"
  }
}
```

**Browser (Terminal 2)**:
```
[Files Store] Received SSE event: file-deleted
[Files Store] Removing file: <file-id>
```

### Expected UI Behavior:
- File disappears from list immediately (no refresh needed)

---

## Test Execution

### Test Run 1: Fresh Server Restart Test

**Time**: 2025-11-13 10:37 AM

**Preparation**:
- Killing all existing dev servers
- Starting fresh dev server
- Uploading test file to establish clean baseline

**File Uploaded**: `sse-delete-test.txt`

**File ID**: `8ed05356-fb15-4854-8076-d7b0ce50db97`

**Server Logs**:
```
[SSE] Setting up Realtime subscription for channel: files-null
[SSE] Realtime subscription status: SUBSCRIBED
[Vectorization] Generating embedding for text: Test file for SSE DELETE events...
[Vectorization] Successfully generated 1024-dim embedding
[FileProcessor] File 8ed05356-fb15-4854-8076-d7b0ce50db97 marked complete on attempt 1

[DELETE API called via curl]
DELETE returned: {"success":true,"data":{"message":"File deleted successfully","id":"8ed05356-fb15-4854-8076-d7b0ce50db97"}}

❌ NO [SSE] Realtime payload received: log for DELETE event
```

**Browser Logs**: N/A (test performed via curl)

**UI Behavior**: N/A (test performed via curl)

**Result**: ❌ FAILED - DELETE event not received by Supabase Realtime subscription

**Critical Finding**:
- DELETE API successfully removes file from database
- Supabase Realtime subscription is SUBSCRIBED
- But NO DELETE event is broadcast to the server subscription
- This suggests REPLICA IDENTITY FULL may not be working as expected, OR
- Supabase Realtime may not support DELETE events with server-side subscriptions

---

## Debugging Notes

### If No Server Logs Appear:
- Supabase Realtime subscription may not be listening for DELETE events
- Check subscription filter: `user_id=is.null` vs actual file's user_id
- Verify REPLICA IDENTITY FULL is actually applied

### If Server Logs But No Browser Logs:
- SSE broadcast may be failing
- Check browser EventSource connection is still alive
- Check `handleSSEEvent()` in filesStore.ts

### If Browser Logs But No UI Update:
- Files store update logic may be broken
- Check filesStore.ts line 357-359 (DELETE handling)

---

## Related Files

- [/src/routes/api/files/[id]/+server.ts](../src/routes/api/files/[id]/+server.ts) - DELETE endpoint
- [/src/routes/api/files/events/+server.ts](../src/routes/api/files/events/+server.ts) - SSE endpoint
- [/src/lib/stores/filesStore.ts](../src/lib/stores/filesStore.ts) - Frontend store
- [BUG-026 Documentation](./BUG-026-individual-delete-sse.md) - Full bug details

---

## Success Criteria

✅ Test passes if:
1. Server logs show `[SSE] Realtime payload received:` with DELETE event
2. Browser logs show event received
3. UI updates without manual refresh
4. File disappears from list

❌ Test fails if any of the above is missing.
