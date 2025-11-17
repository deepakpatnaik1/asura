# BUG-029: Multiple SSE Connections Preventing Progress Updates

**Date**: 2025-11-13
**Status**: DIAGNOSED - Root cause identified, solution pending approval
**Severity**: HIGH - Progress bars completely non-functional in browser
**Related**: BUG-028 (Realtime events)

---

## Summary

File upload progress bars remain stuck at 0% in the browser UI despite server successfully processing files and sending SSE events. Investigation revealed that **8 separate SSE connections** exist simultaneously, causing Supabase Realtime to send events to only one connection while the browser listens to a different connection.

---

## User Report

**Test Scenario**: Upload a file and observe progress bar

**Expected Behavior**:
- File appears at 0% (pending)
- Progress updates to 75% (processing)
- Progress updates to 100% (ready)
- Progress bar turns green

**Actual Behavior**:
- File appears at 0% (pending)
- Progress **NEVER updates** - stays at 0%
- File never shows as ready
- Requires manual page refresh to see completed file

**User Quote**: "I'm so sorry to see this. A complete fail."

---

## Test Evidence

### Test File Details
- **File ID**: `31e19c2c-ee2b-45c8-985d-39acff58eda9`
- **Filename**: `gettysburg.txt`
- **Upload Date**: 2025-11-13 (after file dropdown UI improvements)

### Browser Console Output
```
[Files Store] Connecting to SSE...
[Files Store] SSE connected
[Chunk 9 UI] File uploaded: 31e19c2c-ee2b-45c8-985d-39acff58eda9
```

**Key Observation**: NO SSE events received by browser despite connection being established.

### Server Logs Output

**Realtime Events Received by Server**:
```
[SSE] Realtime payload received: {
  "eventType": "INSERT",
  "new": {
    "id": "31e19c2c-ee2b-45c8-985d-39acff58eda9",
    "status": "pending",
    "progress": 0
  }
}

[SSE] Realtime payload received: {
  "eventType": "UPDATE",
  "new": {
    "id": "31e19c2c-ee2b-45c8-985d-39acff58eda9",
    "progress": 75,
    "processing_stage": "compression"
  }
}

[FileProcessor] File 31e19c2c-ee2b-45c8-985d-39acff58eda9 marked complete on attempt 1

[SSE] Realtime payload received: {
  "eventType": "UPDATE",
  "new": {
    "id": "31e19c2c-ee2b-45c8-985d-39acff58eda9",
    "status": "ready",
    "progress": 100
  }
}
```

**SSE Events Sent by Server**:
```
[SSE] Sending event to browser: file-update 31e19c2c-ee2b-45c8-985d-39acff58eda9
[SSE] Event successfully enqueued
[SSE] Sending event to browser: file-update 31e19c2c-ee2b-45c8-985d-39acff58eda9
[SSE] Event successfully enqueued
[SSE] Sending event to browser: file-update 31e19c2c-ee2b-45c8-985d-39acff58eda9
[SSE] Event successfully enqueued
```

**Key Observation**: Server IS sending events (3 times: INSERT, UPDATE 75%, UPDATE 100%), but browser receives NOTHING.

---

## Root Cause Analysis

### Discovery: Multiple SSE Connections

Server logs show **8 separate SSE connection attempts**:
```
[SSE] Setting up Realtime subscription for channel: files-null
[SSE] Setting up Realtime subscription for channel: files-null
[SSE] Setting up Realtime subscription for channel: files-null
[SSE] Setting up Realtime subscription for channel: files-null
[SSE] Setting up Realtime subscription for channel: files-null
[SSE] Setting up Realtime subscription for channel: files-null
[SSE] Setting up Realtime subscription for channel: files-null
[SSE] Setting up Realtime subscription for channel: files-null
```

### The Problem

**Current Architecture** (BROKEN):
```
1. Browser opens EventSource #1 → Server creates SSE connection #1 with Realtime subscription #1
2. Hot reload occurs → Browser opens EventSource #2 → Server creates SSE connection #2 with Realtime subscription #2
3. Another reload → Browser opens EventSource #3 → Server creates SSE connection #3 with Realtime subscription #3
... (repeats 8 times)

Database Change → Supabase Realtime → Sends event to subscription #8 (most recent)
                                     ↓
                           Server connection #8 receives event
                                     ↓
                           Server enqueues event to ReadableStream #8
                                     ↓
                           BUT: Browser is listening to EventSource #1 (receives nothing!)
```

### Why Multiple Connections Exist

Likely causes:
1. **Hot Module Reload (HMR)**: Vite/SvelteKit hot reloading creates new EventSource without closing old ones
2. **Component Re-mounting**: File store subscribes on mount, may be mounting multiple times
3. **Dev Server Restarts**: Multiple dev server instances running (less likely)
4. **Browser Behavior**: EventSource connections may not be properly closed on page refresh

### Technical Details

**File**: `/src/routes/api/files/events/+server.ts`

**Current Implementation**:
- Each SSE GET request creates a NEW Realtime subscription
- Realtime subscriptions are per-connection (not shared)
- Supabase Realtime only sends events to the MOST RECENT subscription on the same channel
- Old connections remain open but receive no events

**Result**: Race condition where browser and server are out of sync on which connection is "active"

---

## Evidence Summary

| Component | Status | Details |
|-----------|--------|---------|
| Database Updates | ✅ Working | File processing completes successfully |
| Supabase Realtime | ✅ Working | Events delivered to server |
| Server SSE Endpoint | ✅ Working | Events enqueued to stream |
| Browser SSE Connection | ✅ Established | Connection opens successfully |
| Event Delivery to Browser | ❌ **BROKEN** | Browser receives zero events |

**Diagnosis**: The entire pipeline works EXCEPT for the final hop from server stream to browser - because the browser is listening to the wrong stream.

---

## Impact

### User Experience Impact
- **CRITICAL**: File upload progress completely broken
- Users cannot see upload progress in real-time
- Must manually refresh page to see completed files
- Creates perception that uploads are stuck/frozen
- Violates requirements from `REQUIREMENTS-file-upload-ux.md`

### Developer Experience Impact
- Makes testing extremely difficult
- Hard to debug (logs show success, UI shows failure)
- Hot reloading exacerbates the problem during development

---

## Reproduction Steps

1. Start dev server: `npm run dev`
2. Open browser to `http://localhost:5173`
3. Open browser console
4. Check server logs - count SSE subscription setups
5. Upload a file
6. Observe:
   - Server logs show events being sent
   - Browser console shows NO events received
   - Progress bar stuck at 0%

---

## Solution Options

### Option 1: Single Global Realtime Subscription (Recommended)

**Architecture**:
```
                    ┌─────────────────────────────────────┐
                    │   Global Realtime Subscription      │
                    │   (ONE per server, channel: files)  │
                    └──────────────┬──────────────────────┘
                                   │
                    Database Event │
                                   ↓
                    ┌──────────────────────────────────────┐
                    │  Broadcast to ALL active SSE clients │
                    └──────────────┬───────────────────────┘
                                   │
                    ┌──────────────┼───────────────────┐
                    ↓              ↓                   ↓
              [Browser 1]    [Browser 2]  ...   [Browser N]
```

**Implementation**:
- Create module-level Realtime subscription (not per-request)
- Maintain in-memory Set of active SSE controllers
- When Realtime event arrives, broadcast to ALL controllers
- Add/remove controllers as SSE connections open/close

**Pros**:
- Fixes the multiple connection problem
- More efficient (1 DB connection vs N)
- Follows Supabase best practices
- Scales better to multiple users

**Cons**:
- Requires refactoring SSE endpoint
- More complex state management
- Need to handle subscription lifecycle carefully

### Option 2: Connection Deduplication

**Architecture**:
- Track active SSE connections in a Map (keyed by userId)
- When new connection opens, close old connection for same user
- Only allow ONE connection per user

**Pros**:
- Simpler implementation
- Minimal code changes

**Cons**:
- Doesn't solve hot reload issue (old connections linger)
- Doesn't scale to multiple tabs
- Doesn't follow Supabase recommendations

### Option 3: Client-Side Reconnection Logic

**Architecture**:
- Browser detects stale connection (no heartbeat for 60s)
- Closes old EventSource and creates new one
- Adds reconnection backoff logic

**Pros**:
- No server changes needed
- Fixes user experience eventually

**Cons**:
- Doesn't prevent multiple connections
- Adds 60s+ delay before recovery
- Band-aid solution, not root cause fix

---

## Recommended Solution

**Implement Option 1: Single Global Realtime Subscription**

This is the production-ready solution recommended by Supabase documentation for server-side Realtime:
- https://medium.com/@dipiash/supabase-realtime-postgres-changes-in-node-js-2666009230b0
- Quote: "Recommended to use server-side Realtime and re-stream to clients via Broadcast"

---

## Related Files

- `/src/routes/api/files/events/+server.ts` - SSE endpoint (needs refactoring)
- `/src/lib/stores/filesStore.ts` - Client-side EventSource creation
- `/working/REQUIREMENTS-file-upload-ux.md` - Requirements being violated
- `/working/BUG-028-realtime-events-not-broadcasting.md` - Related Realtime bug (resolved)

---

## Next Steps

1. **Awaiting approval** to implement Option 1 (Global Realtime Subscription)
2. Design module-level subscription architecture
3. Implement broadcaster pattern for multiple SSE clients
4. Add connection tracking and cleanup
5. Test with multiple browser tabs and hot reloads
6. Document new architecture

---

## Notes

- This bug was discovered AFTER fixing BUG-028 (SERVICE_ROLE key issue)
- The SERVICE_ROLE fix made Realtime work on the server side
- But revealed a deeper architectural issue with multiple connections
- This explains why previous tests with automated browsers (Playwright) worked - they likely only had 1 connection
- Manual testing with development hot reload exposed the real-world problem

---

## Status: AWAITING USER APPROVAL

Root cause is definitively identified. Solution architecture is clear. Ready to implement pending user authorization.
