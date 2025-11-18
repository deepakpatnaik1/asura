# BUG-009 Implementation: Fix SSE Endpoint Crash on Closed Controller

## Implementation Summary

Fixed the SSE endpoint crash that occurred when heartbeat tried to write to a closed controller after client disconnect.

## Changes Made

### File: `/Users/d.patnaik/code/asura/src/routes/api/files/events/+server.ts`

### Change 0: Move Variables to Proper Scope (Lines 58-60)

**Critical Fix - Variable Scoping:**
Moved `heartbeatInterval` and `isClosed` variables outside of the `start()` method so they can be accessed by both `start()` and `cancel()` methods.

**Code:**
```typescript
// 2. CREATE READABLE STREAM FOR SSE
// Shared state between start() and cancel()
let heartbeatInterval: NodeJS.Timeout | null = null;
let isClosed = false;

const stream = new ReadableStream({
  async start(controller) {
    const encoder = new TextEncoder();
    // ... rest of code
```

**Why:** The `cancel()` method is a separate method of the ReadableStream and needs access to these state variables to properly clean up when the client disconnects.

### Change 1: Enhanced sendEvent Error Handler (Lines 75-85)

**What Changed:**
- Added check for `isClosed` before attempting to close controller
- Wrapped `controller.close()` in try-catch to handle double-close attempts
- Added error logging for debugging

**Code:**
```typescript
catch (error) {
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

**Why:** Prevents crash when enqueue fails on an already-closed controller.

### Change 2: Improved Custom close() Override (Lines 152-170)

**What Changed:**
- Added early return if already closed
- Set `heartbeatInterval = null` after clearing for clarity
- Wrapped `originalClose()` in try-catch to handle edge cases
- Added error logging

**Code:**
```typescript
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

**Why:** Prevents double-close attempts and ensures clean cleanup even if controller is already closed.

### Change 3: Enhanced cancel() Method (Lines 198-210)

**What Changed:**
- Set `isClosed = true` when cancel is called
- Clear heartbeat interval immediately
- Set `heartbeatInterval = null` after clearing
- Added comment about subscription cleanup

**Code:**
```typescript
cancel() {
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

**Why:** This is the KEY fix - when client disconnects, `cancel()` is called first. Setting `isClosed = true` here immediately stops heartbeat from trying to write to the closed controller.

### Change 4: Enhanced Error Handler in Setup (Lines 182-194)

**What Changed:**
- Set `heartbeatInterval = null` after clearing
- Check `isClosed` before attempting to close
- Wrapped `controller.close()` in try-catch

**Code:**
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

**Why:** Ensures safe cleanup even during error scenarios.

## How the Fix Works

### Normal Flow
1. Client connects → SSE stream established
2. Heartbeat fires every 30s → `sendEvent()` checks `isClosed = false` → success
3. Client disconnects → `cancel()` called → sets `isClosed = true` → clears timer
4. If heartbeat fires after disconnect → `sendEvent()` checks `isClosed = true` → returns early
5. No crash!

### Error Flow
1. Enqueue fails → catch block checks `isClosed`
2. If not closed yet → try to close with try-catch protection
3. If close fails → log error but don't crash

### Race Condition Protection
- Variables moved to outer scope so `cancel()` can access them
- `cancel()` sets `isClosed = true` BEFORE clearing interval
- Any heartbeat that fires after this sees `isClosed = true` and returns early
- All `controller.close()` calls wrapped in try-catch
- All close operations check `isClosed` first

## Deviations from Original Plan

**One critical addition:** The plan didn't account for the variable scoping issue. The `isClosed` and `heartbeatInterval` variables needed to be moved outside of the `start()` function to be accessible by the `cancel()` method. This was discovered during implementation and fixed.

## TypeScript Validation

Ran `npm run check` successfully with no errors in the SSE endpoint file.

## Files Modified
- `/Users/d.patnaik/code/asura/src/routes/api/files/events/+server.ts`

## Lines Changed
- Lines 58-60: Moved variables to proper scope (CRITICAL FIX)
- Lines 75-85: Enhanced sendEvent error handler
- Lines 152-170: Improved custom close() override
- Lines 182-194: Enhanced error handler in setup
- Lines 198-210: Enhanced cancel() method

## Risk Assessment
**Low Risk** - All changes are defensive programming improvements that don't affect the happy path. The variable scoping fix is essential for the bug fix to work correctly.
