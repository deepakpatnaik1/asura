# BUG-022: Progress Bar UI Not Updating Despite Successful Backend Processing

## Status
- **Discovered**: 2025-11-13 (Test 8 - After all previous bug fixes)
- **Severity**: MEDIUM (Core feature works, but no user feedback)
- **Status**: 🔍 INVESTIGATING

## Description
File upload completes successfully on the backend (processing, storage, context injection all work), but the progress bar in the UI remains stuck at 0%. Users see no visual feedback despite the file being fully processed and available to the AI.

## Critical Discovery
User verified that uploaded files ARE being processed and stored successfully:
- Asked AI: "Can you see the file that I uploaded?" → **YES**
- Asked AI: "Can you read the actual contents or just the filename?" → **"No, I can actually read the contents"**

**This proves:**
- ✅ File upload endpoint works
- ✅ File processing pipeline works (extraction → compression → embedding → finalization)
- ✅ File stored in database
- ✅ File contents indexed and available for AI context injection
- ❌ **Progress bar UI not showing updates**

## Reproduction Steps
1. Open application at http://localhost:5173
2. Click paperclip icon
3. Select file (e.g., gettysburg.txt)
4. File appears in dropdown
5. Progress bar shows "Pending 0%"
6. **Progress bar never moves** despite successful backend processing

## Expected Behavior
- File shows "Pending 0%" initially
- Progress updates via SSE: 0% → 25% (extraction) → 75% (compression) → 90% (embedding) → 100% (finalization)
- Final state: File shows "Ready 100%"

## Actual Behavior
- File appears in dropdown ✅
- Shows "Pending 0%" ✅
- **Progress bar NEVER updates** ❌
- Backend processes file completely (proven by AI being able to read contents) ✅
- File remains showing "0%" indefinitely ❌

## Root Cause Hypotheses

### Hypothesis 1: Docker/Supabase Not Running (CONFIRMED)
**Evidence:**
- Attempted to connect to Supabase: `Connection refused` on port 54322
- Attempted to start Supabase: `Cannot connect to the Docker daemon`
- Docker Desktop is not running

**Impact:**
- No database connection
- SSE endpoint cannot connect to Supabase Realtime
- SSE cannot broadcast file updates
- Frontend never receives progress updates

**BUT WAIT**: If database isn't running, how is the file being processed and stored?

### Hypothesis 2: Remote Supabase Instance
**Theory:** The app might be connecting to a remote Supabase instance (production), not local.

**Evidence Needed:**
- Check `.env` or environment variables for `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- Check if app is configured to use remote Supabase in development
- Server logs show context including files (127 tokens) - this means database IS accessible

### Hypothesis 3: SSE Connection Established But Not Receiving Updates
**Evidence From Code Review:**

**File:** `src/lib/stores/filesStore.ts`

**Line 456**: SSE connection only established if `subscriberCount === 1 && browser`
```typescript
if (subscriberCount === 1 && browser) {
  // First subscriber - initialize data and connect to SSE
  (async () => {
    try {
      const fileList = await fetchFiles();
      files.set(fileList);
    } catch (err) {
      console.error('[Files Store] Initial fetch failed:', err);
    }
  })();

  connectSSE();
}
```

**Line 256**: EventSource connects to `/api/files/events`
```typescript
eventSource = new EventSource('/api/files/events');
```

**Line 336-364**: SSE event handler updates files store
```typescript
function handleSSEEvent(data: any): void {
  const { eventType, file } = data;

  if (eventType === 'file-update' && file) {
    files.update((current) => {
      const existing = current.findIndex((f) => f.id === file.id);

      if (existing >= 0) {
        // Update existing
        const updated = [...current];
        updated[existing] = {
          ...updated[existing],
          ...file
        };
        return updated;
      } else {
        // Insert new
        return [file, ...current];
      }
    });
  }
}
```

**Possible Issues:**
1. SSE connection may not be establishing (check browser console for connection errors)
2. SSE events may be sent with wrong `eventType` format
3. SSE events may have file ID mismatch (client ID vs server ID)
4. Browser guards may be preventing SSE connection in certain contexts

### Hypothesis 4: SSE Event Format Mismatch
**Check Needed:** Review `/api/files/events/+server.ts` to verify event format matches what store expects.

Expected format (from store code):
```typescript
{
  eventType: 'file-update',  // or 'file-deleted' or 'heartbeat'
  file: {
    id: string,
    filename: string,
    status: string,
    progress: number,
    // ... other fields
  }
}
```

## Investigation Plan

### Step 1: Verify Database Connection
- [ ] Check environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
- [ ] Determine if using local or remote Supabase
- [ ] If local: Start Docker Desktop and Supabase
- [ ] If remote: Verify remote connection is working

### Step 2: Check SSE Connection (Browser Console)
- [ ] Open browser console in Playwright/Chrome
- [ ] Look for SSE connection logs: `[Files Store] Connecting to SSE...`
- [ ] Look for SSE connected log: `[Files Store] SSE connected`
- [ ] Look for SSE errors: `[Files Store] SSE error:`
- [ ] Check Network tab for EventSource connection to `/api/files/events`

### Step 3: Check SSE Events (Server Logs)
- [ ] Upload a file
- [ ] Check server logs for SSE event broadcasting
- [ ] Verify events are being sent with correct format
- [ ] Verify file ID in events matches client file ID

### Step 4: Check File IDs
- [ ] Verify upload endpoint returns real database ID (not placeholder)
- [ ] Verify client stores file with correct ID
- [ ] Verify SSE events use same ID

### Step 5: Verify SSE Endpoint Implementation
- [ ] Review `/api/files/events/+server.ts`
- [ ] Verify Supabase Realtime subscription is set up correctly
- [ ] Verify event payload format matches store expectations
- [ ] Verify filter is correct for null userId: `user_id=is.null` (BUG-020 fix)

## Diagnostic Commands

### Check Environment Variables
```bash
grep -E "(SUPABASE_URL|SUPABASE_ANON_KEY)" .env*
```

### Check Docker Status
```bash
docker ps
```

### Start Supabase (if local)
```bash
npx supabase start
```

### Query Files Table (if database accessible)
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "SELECT id, filename, status, progress, processing_stage FROM files ORDER BY uploaded_at DESC LIMIT 5;"
```

### Monitor SSE Endpoint
```bash
# In browser console or separate terminal
curl -N http://localhost:5173/api/files/events
```

## Related Bugs
- **BUG-019**: SSR execution (browser guards added to filesStore.ts) - May have affected SSE connection
- **BUG-020**: SSE Realtime filter (fixed to use `user_id=is.null`) - Filter must be correct for events to reach client
- **BUG-017**: ID mismatch (fixed with createFilePending + processFileBackground split) - IDs must match for updates to work

## ROOT CAUSE IDENTIFIED ✅

**File:** `src/routes/api/files/events/+server.ts`
**Lines:** 56-62 (error handling), 29 (heartbeat), 46 (heartbeatInterval)

### The Bug

**Server Error Log:**
```
[SSE] Failed to enqueue event: TypeError [ERR_INVALID_STATE]: Invalid state: Controller is already closed
    at ReadableStreamDefaultController.enqueue (node:internal/webstreams/readablestream:1077:13)
    at sendEvent (/Users/d.patnaik/code/asura/src/routes/api/files/events/+server.ts:21:24)
    at Timeout.sendHeartbeat [as _onTimeout] (/Users/d.patnaik/code/asura/src/routes/api/files/events/+server.ts:29:11)
```

### Code Analysis

**Line 46:** Heartbeat interval is created but never stored for cleanup
```typescript
let heartbeatInterval: NodeJS.Timeout | null = null;
```

**Lines 56-62:** When enqueue fails, controller is closed
```typescript
try {
  controller.enqueue(encoder.encode(message));
} catch (error) {
  console.error('[SSE] Failed to enqueue event:', error);
  isClosed = true;
  controller.close();  // ❌ CLOSES CONTROLLER
}
```

**Problem:** Heartbeat interval is not cleared when controller closes. The setInterval continues running and tries to send events on a closed controller, crashing the server.

### Race Condition Flow

1. SSE connection established
2. Heartbeat interval starts (sends event every 30 seconds)
3. Client disconnects OR error occurs
4. Controller closes (line 61)
5. `isClosed` set to true
6. **Heartbeat timer still running** ❌
7. Next heartbeat fires (line 29)
8. `sendEvent()` called (line 67)
9. Guard check `if (isClosed) return` at line 51 **should** prevent execution
10. **BUT**: Try-catch at line 56 catches error and calls `controller.close()` AGAIN
11. **Server crashes**: "Controller is already closed"

### Why Progress Bar Doesn't Update

1. File processing completes successfully ✅
2. Database updates with progress ✅
3. Supabase Realtime triggers UPDATE event ✅
4. SSE endpoint receives event ✅
5. `sendEvent()` tries to enqueue ✅
6. **Controller already closed from previous heartbeat crash** ❌
7. Exception thrown → server crashes ❌
8. **Browser never receives progress updates** ❌

## The Fix

**Required Changes to `/Users/d.patnaik/code/asura/src/routes/api/files/events/+server.ts`:**

### Change 1: Clear heartbeat interval on close

Add cleanup in the error handler and cancel callback:

```typescript
// In sendEvent error handler (line 56-62):
try {
  controller.enqueue(encoder.encode(message));
} catch (error) {
  console.error('[SSE] Failed to enqueue event:', error);
  isClosed = true;

  // Clear heartbeat to prevent further attempts
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Close controller if not already closed
  try {
    controller.close();
  } catch {
    // Already closed, ignore
  }
}
```

### Change 2: Guard controller.close() call

Prevent closing an already-closed controller:

```typescript
try {
  controller.close();
} catch {
  // Controller already closed, ignore
}
```

### Change 3: Clear interval in cancel callback

Ensure cleanup happens when stream is cancelled:

```typescript
cancel() {
  console.log(`[SSE] Stream cancelled for user: ${userId}`);
  isClosed = true;

  // Clear heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Unsubscribe from Realtime
  if (subscription) {
    subscription.unsubscribe();
  }
}
```

## Next Steps
1. ✅ Document bug (this file)
2. ✅ Identify root cause (SSE heartbeat interval not cleared, controller double-close)
3. ⏳ Create fix plan via subagent workflow
4. ⏳ Implement fix (3 changes to SSE endpoint)
5. ⏳ Restart dev server
6. ⏳ Test file upload end-to-end
7. ⏳ Verify progress bar updates correctly
