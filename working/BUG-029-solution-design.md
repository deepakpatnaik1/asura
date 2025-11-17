# BUG-029 Solution: Global Realtime Subscription with Broadcast

**Architecture**: Single module-level Realtime subscription broadcasting to all active SSE clients

---

## Implementation Overview

### Module-Level State (Outside GET Handler)

```typescript
// Global Realtime subscription (shared across all SSE connections)
let globalRealtimeSubscription: any = null;
let isSubscriptionActive = false;

// Track all active SSE client connections
const activeConnections = new Set<ReadableStreamDefaultController>();

// Supabase admin client (reused)
let supabaseAdmin: any = null;

// Cleanup timer (debounced)
let cleanupTimer: NodeJS.Timeout | null = null;
const CLEANUP_DELAY_MS = 5000; // Wait 5s before unsubscribing
```

### Initialization (On First Connection)

```typescript
async function initializeGlobalSubscription() {
  if (isSubscriptionActive) return;

  console.log('[SSE Global] Initializing global Realtime subscription');

  // Create admin client if needed
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }

  // Subscribe to files table changes
  globalRealtimeSubscription = supabaseAdmin
    .channel('files-global')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'files'
    }, handleRealtimeEvent)
    .subscribe((status: string) => {
      console.log('[SSE Global] Subscription status:', status);
      if (status === 'SUBSCRIBED') {
        isSubscriptionActive = true;
      }
    });
}
```

### Broadcast Handler (Realtime → All Clients)

```typescript
function handleRealtimeEvent(payload: any) {
  console.log('[SSE Global] Realtime event received:', payload.eventType);

  // Transform payload to SSE format
  const event = transformPayload(payload);
  const encoder = new TextEncoder();
  const message = `data: ${JSON.stringify(event)}\n\n`;
  const encoded = encoder.encode(message);

  // Broadcast to all active connections
  const deadConnections: ReadableStreamDefaultController[] = [];

  for (const controller of activeConnections) {
    try {
      controller.enqueue(encoded);
    } catch (error) {
      console.warn('[SSE Global] Dead connection detected, marking for removal');
      deadConnections.push(controller);
    }
  }

  // Cleanup dead connections
  deadConnections.forEach(conn => activeConnections.delete(conn));
}

function transformPayload(payload: any): SSEEvent {
  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
    return {
      eventType: 'file-update',
      timestamp: new Date().toISOString(),
      file: {
        id: payload.new.id,
        filename: payload.new.filename,
        file_type: payload.new.file_type,
        status: payload.new.status,
        progress: payload.new.progress,
        processing_stage: payload.new.processing_stage,
        error_message: payload.new.error_message
      }
    };
  } else if (payload.eventType === 'DELETE') {
    return {
      eventType: 'file-deleted',
      timestamp: new Date().toISOString(),
      file: { id: payload.old.id }
    };
  }

  // Fallback (should not happen)
  return {
    eventType: 'heartbeat',
    timestamp: new Date().toISOString()
  };
}
```

### Cleanup (Debounced, On Last Disconnect)

```typescript
function scheduleCleanup() {
  // Cancel existing timer
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
  }

  // Schedule cleanup if no connections remain
  cleanupTimer = setTimeout(() => {
    if (activeConnections.size === 0 && globalRealtimeSubscription) {
      console.log('[SSE Global] No active connections, cleaning up subscription');
      globalRealtimeSubscription.unsubscribe();
      globalRealtimeSubscription = null;
      isSubscriptionActive = false;
      supabaseAdmin = null;
    }
  }, CLEANUP_DELAY_MS);
}

function cancelCleanup() {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
}
```

### Modified GET Handler

```typescript
export const GET: RequestHandler = async ({ request }) => {
  const userId = null; // TODO: Extract from auth after Chunk 11

  let heartbeatInterval: NodeJS.Timeout | null = null;
  let controller: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    async start(ctrl) {
      controller = ctrl;
      const encoder = new TextEncoder();

      // Add to active connections
      activeConnections.add(ctrl);
      console.log('[SSE] Client connected, total:', activeConnections.size);

      // Cancel any pending cleanup
      cancelCleanup();

      // Initialize global subscription (if first connection)
      if (!isSubscriptionActive) {
        await initializeGlobalSubscription();
      }

      // Send initial heartbeat
      const heartbeat = encoder.encode(`data: ${JSON.stringify({
        eventType: 'heartbeat',
        timestamp: new Date().toISOString()
      })}\n\n`);
      ctrl.enqueue(heartbeat);

      // Set up heartbeat interval (every 30s)
      heartbeatInterval = setInterval(() => {
        try {
          ctrl.enqueue(heartbeat);
        } catch (error) {
          console.warn('[SSE] Heartbeat failed, connection likely dead');
          clearInterval(heartbeatInterval!);
        }
      }, 30000);
    },

    cancel() {
      console.log('[SSE] Client disconnected');

      // Remove from active connections
      if (controller) {
        activeConnections.delete(controller);
      }

      // Clear heartbeat
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }

      // Schedule cleanup if last connection
      if (activeConnections.size === 0) {
        scheduleCleanup();
      }

      console.log('[SSE] Remaining connections:', activeConnections.size);
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
```

---

## Key Design Decisions

### 1. Module-Level State
**Why**: Shared across all GET requests to same endpoint
**Risk**: SvelteKit HMR may not clear state properly
**Mitigation**: Cleanup logic handles stale state gracefully

### 2. Debounced Cleanup (5s Delay)
**Why**: Prevents unnecessary unsubscribe/resubscribe during hot reload
**Benefit**: Smooth experience during development
**Tradeoff**: Subscription stays alive 5s after last disconnect (acceptable)

### 3. Broadcast Pattern
**Why**: Single source of truth (1 Realtime subscription)
**Benefit**: No connection conflicts, works with multiple tabs
**Complexity**: Need to track and cleanup dead connections

### 4. Error Handling in Broadcast Loop
**Why**: One failing connection shouldn't break others
**Implementation**: Try-catch per controller, collect dead connections, cleanup after loop

---

## Testing Strategy

### Unit Tests (Conceptual)
1. **Single client**: Connect → Upload file → Verify progress updates → Disconnect
2. **Multiple clients**: Open 2 tabs → Upload in tab 1 → Verify both tabs update
3. **Hot reload**: Connect → HMR trigger → Upload → Verify still works
4. **Reconnection**: Connect → Disconnect → Wait 6s → Connect again → Verify works
5. **Dead connection**: Simulate closed connection during broadcast → Verify cleanup

### Manual Tests
1. Start fresh dev server
2. Open browser, upload file, verify progress bar updates
3. Open second tab, verify both see progress
4. Close first tab, verify second tab still works
5. Hot reload (save file), verify reconnection works
6. Check server logs: Should see only 1-2 active connections max

---

## Performance Impact

**Before**: N connections = N Realtime subscriptions
**After**: N connections = 1 Realtime subscription + N broadcast operations

**Database Load**: Reduced (1 subscription vs N)
**Server CPU**: Minimal increase (broadcast loop is fast)
**Network**: Same (each client still gets events)
**Memory**: Slight increase (Set of controllers)

---

## Migration Path

### Phase 1: Implement
1. Backup current `/src/routes/api/files/events/+server.ts`
2. Add module-level state
3. Add initialization/cleanup functions
4. Add broadcast handler
5. Modify GET handler to use global subscription

### Phase 2: Test
1. Kill all dev servers (ensure clean slate)
2. Start fresh: `npm run dev`
3. Manual testing (single file upload)
4. Multi-tab testing
5. Hot reload testing

### Phase 3: Validate
1. Check server logs: Max 1 subscription active
2. Verify progress bars update in real-time
3. Verify multiple tabs work
4. Verify cleanup after disconnect

---

## Rollback Plan

If implementation fails:
1. `git restore src/routes/api/files/events/+server.ts`
2. Restart dev server
3. Falls back to per-connection subscriptions (current broken behavior)

---

## File Changes Required

**Single File**: `/src/routes/api/files/events/+server.ts`

**Lines Changed**: ~100-120 lines (mostly refactoring, not net new code)

**No Changes Needed**:
- `/src/lib/stores/filesStore.ts` (client-side EventSource stays same)
- Database schema
- Other API endpoints

---

## Estimated Implementation Time

- **Code changes**: 45 minutes
- **Testing**: 30 minutes
- **Debugging**: 30 minutes (buffer)
- **Total**: 1.5-2 hours

---

## Success Criteria

✅ Progress bars update in real-time (0% → 75% → 100%)
✅ Multiple browser tabs all receive updates
✅ Hot reload doesn't break connection
✅ Server logs show only 1 global subscription
✅ No memory leaks (activeConnections size stays bounded)
✅ Cleanup happens 5s after last disconnect

---

## Production Readiness

**Additional Work for Production**:
1. Add user filtering (when auth implemented in Chunk 11)
2. Add connection limits (max N connections per user)
3. Add subscription reconnection logic (handle TIMED_OUT, CLOSED status)
4. Add metrics/monitoring (connection count, broadcast latency)
5. Consider clustering (if multiple server instances)

**Current Implementation**: Development + single-user testing ready
**Production**: Needs auth filtering + reconnection handling
