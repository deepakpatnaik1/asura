# BUG-019 Implementation Plan: SSR Execution of Browser-Only Store Code

## Summary

The `filesStore.ts` executes browser-only code during server-side rendering (SSR), causing server crashes. This is a critical architecture issue that violates SvelteKit SSR best practices. The fix involves adding browser environment guards to prevent execution of browser-only APIs (fetch with relative URLs, EventSource) during SSR, while maintaining full functionality in the browser.

**Approach**: Import SvelteKit's `browser` constant and guard all browser-only operations. The store will gracefully handle SSR by skipping initialization and returning empty state, then properly initialize when first accessed in the browser.

## Root Cause Analysis

From the error logs and code inspection:

1. **Line 361**: `fetch('/api/files')` - Relative fetch URLs not allowed during SSR (Node.js fetch requires absolute URLs)
2. **Line 243**: `new EventSource('/api/files/events')` - EventSource API not available in Node.js environment
3. **Lines 436-447**: Subscription logic runs during SSR when the store module is imported, triggering both errors above

The subscription override at lines 432-464 executes immediately when any component subscribes to the store, including during SSR when the component tree is being rendered on the server.

## File to Modify

**Single file**: `/Users/d.patnaik/code/asura/src/lib/stores/filesStore.ts`

## Detailed Changes

### Change 1: Import browser constant from SvelteKit

**Location**: Top of file, after line 1

**Add new import**:
```typescript
import { browser } from '$app/environment';
```

**Rationale**: SvelteKit's `browser` constant is `true` in browser environment, `false` during SSR. This is the canonical way to detect browser context in SvelteKit apps.

### Change 2: Guard fetchFiles() function

**Location**: Lines 360-369

**Current code**:
```typescript
async function fetchFiles(): Promise<FileItem[]> {
	const response = await fetch('/api/files');
	const json = await response.json();

	if (!response.ok) {
		throw new Error(json.error?.message || 'Failed to fetch files');
	}

	return json.data.files || [];
}
```

**Modified code**:
```typescript
async function fetchFiles(): Promise<FileItem[]> {
	// Guard: Only run in browser
	if (!browser) {
		console.log('[Files Store] Skipping fetchFiles() - not in browser');
		return [];
	}

	const response = await fetch('/api/files');
	const json = await response.json();

	if (!response.ok) {
		throw new Error(json.error?.message || 'Failed to fetch files');
	}

	return json.data.files || [];
}
```

**Rationale**:
- Returns empty array during SSR (safe default)
- Only executes fetch in browser where relative URLs work
- Maintains existing API contract (still returns `Promise<FileItem[]>`)

### Change 3: Guard connectSSE() function

**Location**: Lines 238-271

**Current code**:
```typescript
function connectSSE(): void {
	if (eventSource) return; // Already connected

	console.log('[Files Store] Connecting to SSE...');

	eventSource = new EventSource('/api/files/events');

	// ... event handlers ...
}
```

**Modified code**:
```typescript
function connectSSE(): void {
	// Guard: Only run in browser
	if (!browser) {
		console.log('[Files Store] Skipping connectSSE() - not in browser');
		return;
	}

	if (eventSource) return; // Already connected

	console.log('[Files Store] Connecting to SSE...');

	eventSource = new EventSource('/api/files/events');

	// ... rest of function unchanged ...
}
```

**Rationale**:
- Prevents EventSource instantiation during SSR (EventSource not available in Node.js)
- Early return is safe - SSE connection simply won't exist during SSR
- When code runs in browser, connection works as before

### Change 4: Guard subscription logic

**Location**: Lines 432-464 (subscription override)

**Current code**:
```typescript
const originalFilesSubscribe = files.subscribe.bind(files);
files.subscribe = function (this: typeof files, fn) {
	subscriberCount++;

	if (subscriberCount === 1) {
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

	// ... rest of function ...
};
```

**Modified code**:
```typescript
const originalFilesSubscribe = files.subscribe.bind(files);
files.subscribe = function (this: typeof files, fn) {
	subscriberCount++;

	// Guard: Only initialize on first subscriber in browser
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

	// Call original subscribe
	const unsubscribe = originalFilesSubscribe(fn);

	// Return wrapped unsubscribe
	return () => {
		subscriberCount--;

		// Guard: Only disconnect in browser
		if (subscriberCount === 0 && browser) {
			// Last subscriber unsubscribed - disconnect SSE
			disconnectSSE();
		}

		unsubscribe();
	};
};
```

**Rationale**:
- Primary fix: Prevents initialization during SSR when components subscribe
- During SSR: Subscription works but doesn't trigger fetch/SSE (store returns empty array)
- In browser: First subscription triggers fetch and SSE connection as before
- Also guards cleanup logic to only disconnect in browser
- Maintains subscriber counting logic for proper resource management

### Change 5: Guard refreshFiles() public action

**Location**: Lines 160-172

**Current code**:
```typescript
export async function refreshFiles(): Promise<void> {
	try {
		clearError();

		const fileList = await fetchFiles();
		files.set(fileList);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		setError(`Refresh failed: ${message}`);
		console.error('[Files Store] Refresh error:', err);
		// Don't throw - allow UI to continue working with existing data
	}
}
```

**Modified code**:
```typescript
export async function refreshFiles(): Promise<void> {
	// Guard: Only run in browser
	if (!browser) {
		console.log('[Files Store] Skipping refreshFiles() - not in browser');
		return;
	}

	try {
		clearError();

		const fileList = await fetchFiles();
		files.set(fileList);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		setError(`Refresh failed: ${message}`);
		console.error('[Files Store] Refresh error:', err);
		// Don't throw - allow UI to continue working with existing data
	}
}
```

**Rationale**:
- This is a public action that components can call
- During SSR, calling this would trigger fetchFiles() which is now guarded, but being explicit is clearer
- Safe no-op during SSR, full functionality in browser

## Summary of All Guards

| Function | Location | Guard Type | SSR Behavior |
|----------|----------|------------|--------------|
| `fetchFiles()` | Line 360 | Early return with `[]` | Returns empty array |
| `connectSSE()` | Line 238 | Early return | No SSE connection |
| `refreshFiles()` | Line 160 | Early return | No-op |
| Subscription init | Line 436 | Conditional execution | Skips fetch/SSE |
| Subscription cleanup | Line 457 | Conditional execution | Skips disconnect |

## Testing Approach

### 1. Build Test

**Command**: `npm run build`

**Expected Result**:
- Build completes successfully without SSR errors
- No "fetch is not allowed" errors
- No "EventSource is not defined" errors

**Test Coverage**: Verifies SSR execution doesn't crash

### 2. Unit Test - SSR Simulation

Create `/Users/d.patnaik/code/asura/tests/regression/BUG-019-ssr-store.test.ts`:

```typescript
/**
 * Regression Test: BUG-019 - SSR Execution of Browser-Only Store Code
 *
 * Verifies that filesStore.ts can be imported and used during SSR without
 * executing browser-only code (fetch, EventSource).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Regression: BUG-019 - Files Store SSR Safety', () => {
	beforeEach(() => {
		// Reset all mocks before each test
		vi.resetModules();
	});

	it('should not execute browser-only code when imported during SSR', async () => {
		// Mock $app/environment to simulate SSR (browser = false)
		vi.mock('$app/environment', () => ({
			browser: false
		}));

		// Mock global fetch to detect if it's called
		const mockFetch = vi.fn();
		global.fetch = mockFetch;

		// Mock EventSource to detect if it's instantiated
		const mockEventSource = vi.fn();
		(global as any).EventSource = mockEventSource;

		// Import the store (simulates SSR import)
		const { files } = await import('$lib/stores/filesStore');

		// Subscribe to the store (simulates component subscription during SSR)
		const unsubscribe = files.subscribe(() => {});

		// Wait a tick for any async operations
		await new Promise(resolve => setTimeout(resolve, 0));

		// ASSERTIONS
		// 1. fetch should NOT be called during SSR
		expect(mockFetch).not.toHaveBeenCalled();

		// 2. EventSource should NOT be instantiated during SSR
		expect(mockEventSource).not.toHaveBeenCalled();

		// Cleanup
		unsubscribe();
	});

	it('should return empty array from fetchFiles() during SSR', async () => {
		// Mock SSR environment
		vi.mock('$app/environment', () => ({
			browser: false
		}));

		// Import the store
		const storeModule = await import('$lib/stores/filesStore');

		// Access the internal fetchFiles function if exported for testing
		// OR verify through public refreshFiles() action
		const { refreshFiles, files } = storeModule;

		let currentValue: any[] = [];
		const unsubscribe = files.subscribe(value => {
			currentValue = value;
		});

		// Call refreshFiles during SSR
		await refreshFiles();

		// Should still be empty (no fetch occurred)
		expect(currentValue).toEqual([]);

		unsubscribe();
	});

	it('should execute browser-only code when in browser environment', async () => {
		// Mock browser environment
		vi.mock('$app/environment', () => ({
			browser: true
		}));

		// Mock successful fetch
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: { files: [] } })
		});
		global.fetch = mockFetch;

		// Mock EventSource
		const mockEventSource = vi.fn().mockImplementation(() => ({
			addEventListener: vi.fn(),
			close: vi.fn(),
			onopen: null,
			onerror: null
		}));
		(global as any).EventSource = mockEventSource;

		// Import the store
		const { files } = await import('$lib/stores/filesStore');

		// Subscribe (should trigger fetch and SSE in browser)
		const unsubscribe = files.subscribe(() => {});

		// Wait for async operations
		await new Promise(resolve => setTimeout(resolve, 100));

		// ASSERTIONS
		// 1. fetch SHOULD be called in browser
		expect(mockFetch).toHaveBeenCalledWith('/api/files');

		// 2. EventSource SHOULD be instantiated in browser
		expect(mockEventSource).toHaveBeenCalledWith('/api/files/events');

		// Cleanup
		unsubscribe();
	});
});
```

**Test Coverage**:
- SSR scenario: Verifies no browser APIs called
- Browser scenario: Verifies normal operation
- Validates both modes work correctly

### 3. Manual Test - Dev Server

**Steps**:
1. Start dev server: `npm run dev`
2. Open browser to app URL
3. Open browser DevTools console
4. Navigate to page using files store

**Expected Console Output**:
```
[Files Store] Connecting to SSE...
[Files Store] SSE connected
```

**Expected Behavior**:
- No SSR errors in terminal
- Files load correctly in browser
- SSE updates work normally
- No "Skipping..." messages in browser console (only during SSR)

### 4. Manual Test - Production Build

**Steps**:
1. Build production: `npm run build`
2. Preview production: `npm run preview`
3. Open browser to preview URL
4. Verify files functionality

**Expected Result**:
- Build succeeds without SSR errors
- Production app works identically to dev
- Files load and update correctly

## Risk Assessment

### Low Risk Areas

1. **Derived stores** (`processingFiles`, `readyFiles`, `failedFiles`)
   - These are pure derivations from main store
   - No changes needed
   - Automatically work in both SSR and browser

2. **Public actions** (`uploadFile`, `deleteFile`)
   - These are only called from browser events (button clicks, etc.)
   - Not called during SSR naturally
   - `refreshFiles()` gets explicit guard for safety

3. **Utility functions** (`getFile`, `getFileByName`, `isProcessing`)
   - These are synchronous reads from store
   - Work in both SSR and browser
   - Return undefined/false during SSR (safe defaults)

### Medium Risk Areas

1. **Store initialization timing**
   - **Risk**: Components expect data immediately but get empty array during SSR
   - **Mitigation**: This is expected SvelteKit behavior - SSR renders loading state, browser hydrates with data
   - **Validation**: Test that components handle empty array gracefully

2. **Subscriber count management**
   - **Risk**: Subscriber counting might get out of sync between SSR and browser
   - **Mitigation**: Counting happens in same closure, guards don't affect count logic
   - **Validation**: Monitor console logs for proper connect/disconnect

### Potential Issues and Mitigations

| Issue | Impact | Mitigation |
|-------|--------|------------|
| Components expect immediate data | SEO/initial render shows empty state | Expected SvelteKit pattern - components should handle loading state |
| Race condition on hydration | Brief flash of empty state | SvelteKit handles this via hydration - store initializes immediately after hydration |
| SSE connection delay | Updates delayed ~100ms on page load | Acceptable - connection establishes on first subscription |
| Multiple rapid subscriptions | Could trigger multiple fetches | Existing `subscriberCount` logic prevents this |

### Zero-Risk Changes

All proposed guards are **additive** - they only skip execution during SSR. Browser behavior remains identical:

- Same fetch calls
- Same SSE connection logic
- Same subscription management
- Same error handling
- Same store values

The only change in browser is that guards evaluate to `true` and allow execution to proceed as before.

## Verification Checklist

Before marking this bug as fixed:

- [ ] Build completes successfully (`npm run build`)
- [ ] No SSR errors in build output
- [ ] Unit test passes (BUG-019 regression test)
- [ ] Dev server runs without SSR errors
- [ ] Files load correctly in browser
- [ ] SSE updates work correctly in browser
- [ ] Upload functionality works
- [ ] Delete functionality works
- [ ] Derived stores work (`processingFiles`, etc.)
- [ ] Manual refresh works (`refreshFiles()`)
- [ ] Production preview works

## Success Criteria

1. **Server doesn't crash**: Build and SSR succeed
2. **Browser works perfectly**: All existing functionality preserved
3. **Clean console**: No guard-related messages in browser (only during SSR)
4. **Regression test passes**: Automated verification

## Implementation Notes

### Why `browser` constant instead of `typeof window !== 'undefined'`?

1. **SvelteKit recommendation**: `browser` is the canonical way in SvelteKit
2. **Build optimization**: Vite can tree-shake SSR code blocks using `browser` constant
3. **Consistency**: Matches SvelteKit ecosystem patterns
4. **Type safety**: TypeScript understands `browser` constant better

### Why guard at multiple levels?

**Defense in depth**:
- Guards in functions: Protect against direct calls
- Guards in subscription: Protect against automatic initialization
- Guards in public actions: Protect against component calls

This ensures safety even if calling patterns change in the future.

### Impact on existing code

**Zero changes needed** in:
- Components using the store
- API routes
- Other stores
- Tests (except adding new BUG-019 regression test)

All changes are contained within `filesStore.ts`.

## Edge Cases Handled

1. **Store imported but never subscribed during SSR**: Safe - no guards execute
2. **Store subscribed during SSR then again in browser**: Safe - browser subscription triggers initialization
3. **Multiple components subscribe simultaneously**: Safe - subscriberCount logic unchanged
4. **Component subscribes and immediately unsubscribes**: Safe - guards prevent unnecessary work
5. **Network failure in browser**: Safe - existing error handling unchanged

## Performance Impact

**SSR**: Negligible - guards are simple boolean checks
**Browser**: Zero - guards evaluate to true and execution proceeds normally
**Bundle size**: +1 import, +5 conditional checks (~100 bytes)

## Rollback Plan

If issues arise:
1. Revert single commit containing these changes
2. Store returns to previous behavior
3. SSR will crash again (known issue), but browser works

## Next Steps After Implementation

1. Monitor production logs for any SSR errors
2. Consider adding telemetry to track guard executions
3. Document pattern for future stores using browser APIs
4. Create guideline: "All stores using browser APIs must guard with `browser` constant"
