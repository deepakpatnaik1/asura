# BUG-009 Implementation Plan: Fix SSE Endpoint Crash on Closed Controller

## Overview
Fix the SSE endpoint crash that occurs when heartbeat tries to write to a closed controller after the client disconnects.

## Problem Analysis

### Current Issues
1. **Line 76**: Error handler in `sendEvent()` calls `controller.close()` without checking if already closed
2. **Lines 142-150**: Custom `close()` override doesn't prevent double-closing
3. **Lines 170-173**: `cancel()` method doesn't clear heartbeat interval or set `isClosed` flag
4. **Race condition**: Heartbeat timer can fire after connection closes but before cleanup completes

### Root Cause
The `cancel()` method is called by the ReadableStream when the client disconnects, but:
- It doesn't set `isClosed = true`
- It doesn't clear the heartbeat interval
- Meanwhile, heartbeat timer can fire and try to write to closed controller
- This causes `ERR_INVALID_STATE: Controller is already closed`
- Error handler then tries to close again → Fatal crash

## Implementation Plan

### Change 1: Fix sendEvent Error Handler (Lines 71-77)

**Current Code:**
```typescript
try {
  controller.enqueue(encoder.encode(message));
} catch (error) {
  console.error('[SSE] Failed to enqueue event:', error);
  isClosed = true;
  controller.close();
}
```

**New Code:**
```typescript
try {
  controller.enqueue(encoder.encode(message));
} catch (error) {
  console.error('[SSE] Failed to enqueue event:', error);
  if (!isClosed) {
    isClosed = true;
    try {
      controller.close();
    } catch (closeError) {
      // Controller already closed, ignore
      console.error('[SSE] Controller already closed:', closeError);
    }
  }
}
```

**Reasoning:**
- Check `isClosed` before attempting to close
- Wrap `controller.close()` in try-catch to handle case where it's already closed
- Log the close error for debugging

### Change 2: Improve Custom close() Override (Lines 142-150)

**Current Code:**
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

**New Code:**
```typescript
const originalClose = controller.close.bind(controller);
controller.close = () => {
  if (isClosed) {
    return; // Already closed, don't try again
  }

  isClosed = true;
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  subscription.unsubscribe();

  try {
    originalClose();
  } catch (error) {
    // Controller already closed, ignore
    console.error('[SSE] Error during close:', error);
  }
};
```

**Reasoning:**
- Early return if already closed
- Set heartbeatInterval to null after clearing
- Wrap originalClose() in try-catch to handle double-close attempts
- Log errors for debugging

### Change 3: Fix cancel() Method (Lines 170-173)

**Current Code:**
```typescript
cancel() {
  // Called when client disconnects (browser closes connection, network loss, etc.)
  console.log(`[SSE] Stream cancelled for user: ${userId}`);
}
```

**New Code:**
```typescript
cancel() {
  // Called when client disconnects (browser closes connection, network loss, etc.)
  console.log(`[SSE] Stream cancelled for user: ${userId}`);

  if (!isClosed) {
    isClosed = true;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    // Note: subscription cleanup happens in close() method
  }
}
```

**Reasoning:**
- Set `isClosed = true` immediately when cancel is called
- Clear heartbeat interval to stop timer
- This prevents heartbeat from firing after client disconnects
- No need to unsubscribe here as it's handled in close() method

### Change 4: Improve Error Handler in Setup (Lines 162-166)

**Current Code:**
```typescript
if (heartbeatInterval) {
  clearInterval(heartbeatInterval);
}

controller.close();
```

**New Code:**
```typescript
if (heartbeatInterval) {
  clearInterval(heartbeatInterval);
  heartbeatInterval = null;
}

if (!isClosed) {
  try {
    controller.close();
  } catch (error) {
    // Controller already closed, ignore
    console.error('[SSE] Error closing controller in error handler:', error);
  }
}
```

**Reasoning:**
- Set heartbeatInterval to null after clearing
- Check `isClosed` before attempting to close
- Wrap close() in try-catch to handle edge cases

## Variable Scope Consideration

**Important:** The variables `heartbeatInterval`, `isClosed`, and `subscription` need to be accessible from both the custom `close()` method and the `cancel()` method. They are currently declared inside the `start()` function, which is correct. However, we need to ensure proper cleanup happens in the right order.

## Execution Order on Disconnect

When a client disconnects:
1. `cancel()` is called first by ReadableStream
2. Then controller is closed (either explicitly or automatically)
3. Our custom `close()` override is called

Therefore:
- `cancel()` should set `isClosed = true` and clear timers
- Custom `close()` should check `isClosed` and avoid double-cleanup

## Edge Cases Handled

1. **Browser refresh**: `cancel()` called → sets `isClosed` → heartbeat check fails → no crash
2. **Browser close**: Same as refresh
3. **Network loss**: `cancel()` called → cleanup happens → safe
4. **Heartbeat fires during cleanup**: `isClosed = true` check prevents enqueue
5. **Double close attempts**: Try-catch blocks prevent crashes
6. **Subscription error during setup**: Error handler checks `isClosed` before closing

## Testing Plan

### Manual Testing
1. Open SSE connection in browser
2. Verify heartbeat events arrive every 30 seconds
3. Refresh browser page
4. Verify no server crash
5. Check server logs for clean shutdown message
6. Repeat with browser close
7. Repeat with network disconnect simulation

### Expected Console Output (Success)
```
[SSE] Stream cancelled for user: null
[SSE] Error during close: [some error] (or no error if clean)
```

### Expected Console Output (No Crash)
No `ERR_INVALID_STATE: Controller is already closed` errors

## Files Modified
- `/Users/d.patnaik/code/asura/src/routes/api/files/events/+server.ts`

## Summary of Changes
1. Added safe close checks in `sendEvent` error handler
2. Added early return in custom `close()` override
3. Added cleanup in `cancel()` method
4. Added try-catch around all `controller.close()` calls
5. Set `heartbeatInterval = null` after clearing for clarity
6. Added console.error logging for debugging

## Risk Assessment
**Low Risk** - These are defensive programming improvements that:
- Don't change the happy path behavior
- Only add safety checks for error cases
- Maintain backward compatibility
- Follow existing patterns in the codebase
