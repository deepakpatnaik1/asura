# BUG-022 Implementation Plan: SSE Endpoint Cancel Callback Cleanup

## Summary

The SSE endpoint's `cancel()` callback (lines 155-158 in `/Users/d.patnaik/code/asura/src/routes/api/files/events/+server.ts`) is incomplete. When the client disconnects, the stream is cancelled but cleanup doesn't happen properly, leading to resource leaks and potential crashes from double-close errors. The fix involves completing the cancel callback, guarding close operations with try-catch blocks, and ensuring heartbeat interval cleanup happens in all error paths.

**Approach**: Make three surgical changes to ensure proper cleanup:
1. Complete the `cancel()` callback with full cleanup logic
2. Guard `originalClose()` call to prevent double-close crashes
3. Add interval cleanup in error handler to prevent orphaned timers

## Root Cause Analysis

From the bug investigation document (BUG-022-progress-bar-not-updating.md):

### The Bug

**Server Error Log:**
```
[SSE] Failed to enqueue event: TypeError [ERR_INVALID_STATE]: Invalid state: Controller is already closed
    at ReadableStreamDefaultController.enqueue (node:internal/webstreams/readablestream:1077:13)
    at sendEvent (/Users/d.patnaik/code/asura/src/routes/api/files/events/+server.ts:21:24)
    at Timeout.sendHeartbeat [as _onTimeout] (/Users/d.patnaik/code/asura/src/routes/api/files/events/+server.ts:29:11)
```

### Race Condition Flow

1. SSE connection established
2. Heartbeat interval starts (sends event every 30 seconds)
3. Client disconnects OR error occurs
4. Controller closes (line 61 or line 134)
5. `isClosed` set to true
6. **Heartbeat timer still running** - NOT CLEARED
7. Next heartbeat fires (line 66-71)
8. `sendEvent()` called
9. Guard check `if (isClosed) return` at line 51 prevents enqueue
10. **BUT**: If error occurs during enqueue, try-catch at line 56 calls `controller.close()` AGAIN
11. **Server crashes**: "Controller is already closed"

### Three Missing Pieces

1. **Line 155-158**: `cancel()` callback is empty - doesn't set `isClosed`, clear interval, or unsubscribe
2. **Line 134**: `originalClose()` not guarded - can throw if controller already closed
3. **Line 56-62**: Error handler closes controller but doesn't clear heartbeat interval

## File to Modify

**Single file**: `/Users/d.patnaik/code/asura/src/routes/api/files/events/+server.ts`

## Current Code Analysis

### Problem Area 1: Empty cancel() callback (Lines 155-158)

**Current code:**
```typescript
cancel() {
  // Called when client disconnects (browser closes connection, network loss, etc.)
  console.log(`[SSE] Stream cancelled for user: ${userId}`);
}
```

**Issue**: No cleanup happens when stream is cancelled by client disconnect or network loss.

**Impact**:
- `isClosed` flag not set - other functions may try to use closed controller
- `heartbeatInterval` not cleared - timer continues firing
- `subscription` not unsubscribed - Supabase connection remains open

### Problem Area 2: Unguarded originalClose() (Line 134)

**Current code:**
```typescript
const originalClose = controller.close.bind(controller);
controller.close = () => {
  isClosed = true;
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  subscription.unsubscribe();
  originalClose();  // ❌ NOT GUARDED - can throw if already closed
};
```

**Issue**: If controller already closed, calling `originalClose()` throws exception.

**Impact**: Server crash with "Controller is already closed" error.

### Problem Area 3: Error handler missing interval cleanup (Lines 56-62)

**Current code:**
```typescript
try {
  controller.enqueue(encoder.encode(message));
} catch (error) {
  console.error('[SSE] Failed to enqueue event:', error);
  isClosed = true;
  controller.close();  // ❌ Two issues:
                       // 1. Not guarded (can throw)
                       // 2. Doesn't clear heartbeatInterval first
}
```

**Issue**: When enqueue fails, heartbeat interval is not cleared before closing controller.

**Impact**:
- Orphaned timer continues firing after controller closed
- Next heartbeat attempt crashes server
- Resource leak (timer never cleaned up)

## Detailed Changes

### Change 1: Complete the cancel() callback

**Location**: Lines 155-158

**Current code:**
```typescript
cancel() {
  // Called when client disconnects (browser closes connection, network loss, etc.)
  console.log(`[SSE] Stream cancelled for user: ${userId}`);
}
```

**New code:**
```typescript
cancel() {
  // Called when client disconnects (browser closes connection, network loss, etc.)
  console.log(`[SSE] Stream cancelled for user: ${userId}`);

  // Set closed flag to prevent further operations
  isClosed = true;

  // Clear heartbeat interval to prevent timer from firing
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Unsubscribe from Supabase Realtime
  subscription.unsubscribe();
}
```

**Rationale**:
- `isClosed = true`: Prevents `sendEvent()` from attempting to enqueue after cancellation
- `clearInterval(heartbeatInterval)`: Stops timer from firing on closed controller
- `heartbeatInterval = null`: Defensive cleanup to prevent double-clear
- `subscription.unsubscribe()`: Releases Supabase connection resources
- Order matters: Set flag first, then clear resources
- No need to call `controller.close()` - cancellation already closed it

**Key Insight**: `cancel()` is called AFTER the stream is already closed by the platform, so we should NOT call `controller.close()` again. We only need to clean up our resources (timer and subscription).

### Change 2: Guard originalClose() call

**Location**: Line 134

**Current code:**
```typescript
const originalClose = controller.close.bind(controller);
controller.close = () => {
  isClosed = true;
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  subscription.unsubscribe();
  originalClose();
};
```

**New code:**
```typescript
const originalClose = controller.close.bind(controller);
controller.close = () => {
  isClosed = true;
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  subscription.unsubscribe();

  // Guard against double-close (controller may already be closed)
  try {
    originalClose();
  } catch (error) {
    // Controller already closed - this is fine, cleanup already done
    console.log('[SSE] Controller already closed during cleanup');
  }
};
```

**Rationale**:
- Try-catch prevents crash if controller already closed
- Silent catch is appropriate - this is an expected edge case
- Log message aids debugging but doesn't escalate to error
- Cleanup (flag, interval, subscription) happens BEFORE close attempt
- Even if close fails, resources are properly cleaned up

**Key Insight**: The cleanup (lines 129-133) must happen before the guarded close. This ensures resources are always released even if close throws.

### Change 3: Add interval cleanup in error handler

**Location**: Lines 56-62

**Current code:**
```typescript
try {
  controller.enqueue(encoder.encode(message));
} catch (error) {
  console.error('[SSE] Failed to enqueue event:', error);
  isClosed = true;
  controller.close();
}
```

**New code:**
```typescript
try {
  controller.enqueue(encoder.encode(message));
} catch (error) {
  console.error('[SSE] Failed to enqueue event:', error);
  isClosed = true;

  // Clear heartbeat interval to prevent further send attempts
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Guard controller.close() - may already be closed
  try {
    controller.close();
  } catch {
    // Controller already closed - ignore
  }
}
```

**Rationale**:
- Clear heartbeat BEFORE attempting close to prevent race condition
- Prevents orphaned timer from firing on closed controller
- Guard close with try-catch to prevent double-close crash
- Silent inner catch is appropriate - close is best-effort cleanup
- Setting `isClosed = true` prevents new events from being queued

**Key Insight**: The heartbeat interval MUST be cleared before any close attempt. This is the critical fix that prevents the race condition described in the bug report.

## Summary of Changes

| Area | Lines | Change | Purpose |
|------|-------|--------|---------|
| `cancel()` callback | 155-158 | Add full cleanup logic | Prevent resource leaks on client disconnect |
| Wrapped `controller.close()` | 134 | Wrap in try-catch | Prevent double-close crash |
| `sendEvent` error handler | 56-62 | Clear interval + guard close | Prevent orphaned timer + double-close crash |

## State Management Flow

### Before Fix

```
Client disconnect
    ↓
cancel() called
    ↓
Only logs message ❌
    ↓
heartbeatInterval still running ❌
subscription still active ❌
    ↓
Next heartbeat fires
    ↓
Attempts to send on closed controller
    ↓
💥 CRASH
```

### After Fix

```
Client disconnect
    ↓
cancel() called
    ↓
isClosed = true ✅
heartbeatInterval cleared ✅
subscription unsubscribed ✅
    ↓
No more heartbeats fire ✅
Resources properly released ✅
    ↓
✅ CLEAN SHUTDOWN
```

## Testing Approach

### 1. Build Test

**Command**: `npm run build`

**Expected Result**:
- Build completes successfully
- No TypeScript errors
- No SSE-related warnings

**Test Coverage**: Verifies syntax and type safety

### 2. Manual Test - Client Disconnect

**Steps**:
1. Start dev server: `npm run dev`
2. Open browser to application
3. Open browser DevTools → Network tab
4. Filter for `/api/files/events` EventSource connection
5. Verify connection established (status 200, type "eventsource")
6. Close browser tab abruptly (simulates disconnect)
7. Check server logs via `BashOutput`

**Expected Server Logs**:
```
[SSE] Stream cancelled for user: null
```

**Expected Behavior**:
- No crash or error logs
- Clean shutdown message
- No "Controller is already closed" errors
- No continued heartbeat attempts

**Test Coverage**: Verifies cancel() callback cleanup works

### 3. Manual Test - Long-Running Connection

**Steps**:
1. Start dev server: `npm run dev`
2. Open browser to application
3. Let SSE connection run for 60+ seconds (2 heartbeats)
4. Monitor server logs for heartbeat activity
5. Upload a file (triggers file-update events)
6. Close browser tab
7. Check server logs

**Expected Behavior**:
- Regular heartbeats every 30 seconds
- File events delivered successfully
- Clean shutdown on disconnect
- No orphaned timers or crashes

**Test Coverage**: Verifies heartbeat works and cleanup happens after extended use

### 4. Manual Test - Network Error Simulation

**Steps**:
1. Start dev server
2. Open browser DevTools → Network tab
3. Establish SSE connection
4. Use DevTools to simulate offline/network error
5. Check server logs for error handling

**Expected Server Logs**:
```
[SSE] Failed to enqueue event: [error details]
```

**Expected Behavior**:
- Error logged but no crash
- Heartbeat interval cleared
- Controller closed gracefully
- No "Controller is already closed" errors

**Test Coverage**: Verifies error handler cleanup works

### 5. Regression Test - File Upload Progress

**Purpose**: Verify this fix resolves BUG-022 (progress bar not updating)

**Steps**:
1. Start dev server
2. Open application
3. Upload a file (e.g., gettysburg.txt)
4. Watch progress bar in UI

**Expected Behavior**:
- Progress bar starts at 0%
- Updates to 25%, 75%, 90%, 100% as processing progresses
- SSE connection remains stable throughout
- No server crashes during processing
- File reaches "Ready 100%" state

**Test Coverage**: End-to-end verification that SSE updates work correctly

### 6. Unit Test - SSE Endpoint (Existing Tests)

**File**: `/Users/d.patnaik/code/asura/tests/integration/api/sse-endpoint.test.ts`

**Command**: `npm test sse-endpoint.test.ts`

**Expected Result**:
- All existing tests pass
- No regressions in SSE headers, format, or error handling

**Test Coverage**: Verifies existing SSE functionality unchanged

## Edge Cases Handled

### 1. Double-close scenarios

**Scenario**: Controller closed by error, then cancel() called
**Handling**: Try-catch guards prevent crash
**Result**: Clean shutdown with log message

### 2. Rapid disconnect/reconnect

**Scenario**: Client disconnects and reconnects quickly
**Handling**: `isClosed` flag prevents operations on old controller
**Result**: New connection established, old one cleaned up properly

### 3. Error during heartbeat after disconnect

**Scenario**: Heartbeat fires during cancel() execution
**Handling**: `isClosed` flag checked at start of `sendEvent()`
**Result**: Early return, no enqueue attempted

### 4. Multiple simultaneous errors

**Scenario**: Enqueue error + disconnect happen at same time
**Handling**: Both paths clear interval and close controller (guarded)
**Result**: Resources cleaned up once, no double-free issues

### 5. Controller already closed before wrapped close() called

**Scenario**: Platform closes controller before our cleanup runs
**Handling**: Try-catch in wrapped `controller.close()` catches exception
**Result**: Cleanup completes successfully despite close failure

## Risk Assessment

### Low Risk Changes

All three changes are defensive additions that prevent crashes:

1. **cancel() completion**: Pure addition - was empty, now has cleanup
2. **Try-catch guards**: Pure addition - doesn't change happy path
3. **Interval clearing**: Pure addition - prevents orphaned timers

### Zero Risk to Existing Functionality

**Browser behavior unchanged**:
- Same SSE connection process
- Same event format
- Same heartbeat timing
- Same file update delivery
- Same error messages

**Only changes**:
- Better cleanup on disconnect
- No crashes on edge cases
- No resource leaks

### Potential Issues and Mitigations

| Issue | Impact | Mitigation |
|-------|--------|------------|
| Try-catch hides real errors | Could mask actual bugs | Only catches close-related errors, all other errors still thrown |
| Multiple cleanup paths | Could double-free resources | All cleanup operations are idempotent (safe to call multiple times) |
| Race between cancel() and error handler | Could have incomplete cleanup | Both paths clean same resources - overlap is safe |

### Defense in Depth

Three layers of protection:

1. **cancel() callback**: Cleans up on client disconnect
2. **Error handler**: Cleans up on enqueue failures
3. **Wrapped close()**: Cleans up on explicit close + guards against double-close

Any one of these prevents resource leaks and crashes.

## Verification Checklist

Before marking this bug as fixed:

- [ ] Code changes implemented exactly as specified
- [ ] Build completes successfully (`npm run build`)
- [ ] Dev server starts without errors
- [ ] Manual test: Client disconnect → clean shutdown
- [ ] Manual test: Long-running connection → proper cleanup
- [ ] Manual test: Network error → graceful handling
- [ ] Regression test: File upload progress updates correctly
- [ ] Unit tests pass (`npm test sse-endpoint.test.ts`)
- [ ] No "Controller is already closed" errors in any scenario
- [ ] Server logs show proper cleanup messages

## Success Criteria

1. **No crashes**: Server never crashes from double-close errors
2. **No resource leaks**: Heartbeat intervals always cleared, subscriptions always unsubscribed
3. **Clean logs**: Proper shutdown messages, no orphaned timer errors
4. **Progress bar works**: File upload progress updates reach UI (resolves BUG-022)
5. **All tests pass**: Build, unit, and manual tests all succeed

## Implementation Notes

### Why not just guard sendEvent() with try-catch?

We do guard it (lines 56-62), but that's not enough:
- The guard catches the error AFTER it happens
- By then, the controller is closed but heartbeat still running
- Need to clear interval to prevent future attempts

### Why clean up in both cancel() and error handler?

**Different trigger paths**:
- `cancel()`: Client disconnect, network loss
- Error handler: Enqueue failure, controller errors

Both need cleanup to handle all scenarios. Cleanup operations are idempotent so overlap is safe.

### Why log message in catch block?

Aids debugging without escalating to error:
- Shows cleanup path taken
- Confirms double-close scenario handled
- No alarm raised (this is expected edge case)

### Why set isClosed before clearing interval?

**Order matters for thread safety**:
1. Set `isClosed = true` first
2. Then clear interval
3. Then unsubscribe/close

This prevents race where heartbeat fires during cleanup.

## Relationship to Other Bugs

### BUG-022 Root Cause

This incomplete cleanup is THE root cause of BUG-022 (progress bar not updating):

1. Controller closes prematurely due to error
2. Heartbeat timer not cleared
3. Timer fires on closed controller → crash
4. SSE connection broken
5. File updates never reach client
6. Progress bar stuck at 0%

**This fix resolves BUG-022 completely.**

### Related Bugs

- **BUG-020**: SSE Realtime filter fix - Ensures events reach the endpoint
- **BUG-019**: SSR browser guards - Prevents SSE from running during build
- **BUG-017**: ID mismatch fix - Ensures updates target correct file

All four bugs combined ensure:
- SSE runs only in browser ✅ (BUG-019)
- SSE connects to database ✅ (works with BUG-020 filter)
- SSE receives correct events ✅ (BUG-020)
- SSE delivers updates to UI ✅ (BUG-022 - THIS FIX)
- Updates target correct file ✅ (BUG-017)

## Performance Impact

**Server**:
- Negligible - three try-catch blocks and interval checks
- Reduced load - no orphaned timers consuming resources

**Browser**:
- Zero - no client-side changes
- Improved stability - SSE connection stays open longer

**Memory**:
- Reduced - no resource leaks from unclosed subscriptions

## Rollback Plan

If issues arise:
1. Revert single commit containing these changes
2. SSE returns to previous behavior
3. Progress bar bug returns (known issue)
4. No new issues introduced

Changes are purely additive (guards and cleanup), so rollback is safe.

## Next Steps After Implementation

1. Monitor server logs for "Controller already closed" messages (should decrease to zero)
2. Verify file upload progress updates work consistently
3. Consider adding telemetry to track SSE connection lifetimes
4. Document cleanup pattern for future SSE/streaming endpoints
5. Update SSE endpoint tests to verify cleanup (enable skipped tests in sse-endpoint.test.ts)

## Related Documentation

- **Bug Report**: `/Users/d.patnaik/code/asura/working/BUG-022-progress-bar-not-updating.md`
- **SSE Endpoint**: `/Users/d.patnaik/code/asura/src/routes/api/files/events/+server.ts`
- **SSE Tests**: `/Users/d.patnaik/code/asura/tests/integration/api/sse-endpoint.test.ts`
- **Files Store**: `/Users/d.patnaik/code/asura/src/lib/stores/filesStore.ts` (SSE client)
