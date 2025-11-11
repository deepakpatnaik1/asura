# Chunk 8 Plan: Files Store

## Status
Draft

## Overview

Create a Svelte reactive store for managing file upload state on the frontend. The Files Store will:

1. **Maintain file list state** - Writable store with all user's files (array of File objects)
2. **Subscribe to SSE** - Connect to `/api/files/events` endpoint (Chunk 7) for real-time progress updates
3. **Fetch initial state** - Call `GET /api/files` (Chunk 6) to load files on mount
4. **Provide actions** - `uploadFile()`, `deleteFile()`, `refreshFiles()` functions
5. **Export derived stores** - `processingFiles`, `readyFiles`, `failedFiles` for UI filtering
6. **Handle connection lifecycle** - Connect on first subscription, disconnect when all subscribers unsubscribe
7. **Provide utilities** - Helper functions for file selection and lookup

## Dependencies

- **Chunk 6 (API)**:
  - `GET /api/files` - fetch file list
  - `POST /api/files/upload` - upload file
  - `DELETE /api/files/[id]` - delete file
- **Chunk 7 (SSE)**: `GET /api/files/events` - real-time progress updates
- **Svelte**: `writable()`, `derived()` store functions
- **SvelteKit**: Client-side request handling

## Design Decisions

### 1. Store Structure

**Decision**: Single writable store for file list, with derived stores for filtering.

**File Object Shape** (matches Chunk 6 API response):
```typescript
interface FileItem {
  id: string;                                    // UUID
  filename: string;                              // Original filename
  file_type: 'pdf' | 'image' | 'text' | 'code' | 'spreadsheet' | 'other'; // File type
  status: 'pending' | 'processing' | 'ready' | 'failed'; // Current status
  progress: number;                              // 0-100
  processing_stage: 'extraction' | 'compression' | 'embedding' | 'finalization' | null;
  error_message: string | null;                  // Error details if failed
  created_at: string;                            // ISO 8601 timestamp
  updated_at: string;                            // ISO 8601 timestamp
}

// Store state
type FilesState = FileItem[];
```

**Rationale**:
- Simple array structure - easy to map in UI
- Matches API response format (no transformation needed)
- Derived stores filter without duplicating data
- Single source of truth for UI components

### 2. SSE Connection Management

**Decision**: Connect to SSE on first subscriber, disconnect when all unsubscribe.

**Implementation Pattern**:
```typescript
let eventSource: EventSource | null = null;
let subscriberCount = 0;

// Store subscription with auto-connect/disconnect
export function subscribeFiles(callback) {
  subscriberCount++;
  if (!eventSource) {
    connectSSE();  // First subscriber opens connection
  }

  return () => {
    subscriberCount--;
    if (subscriberCount === 0) {
      disconnectSSE();  // Last unsubscriber closes connection
    }
  };
}
```

**Benefits**:
- No wasted SSE connection if no UI components are visible
- Automatic cleanup when all components unmount
- Single EventSource for all subscribers (shared)
- Graceful error handling and reconnection

**Reconnection Strategy**:
- If EventSource errors, wait 3 seconds and retry
- Max 5 reconnection attempts
- After 5 failures, log error and stop retrying
- User can manually retry via `refreshFiles()` action

### 3. File List Fetching

**Decision**: Fetch on store initialization and manually via `refreshFiles()` action.

**When to fetch**:
1. **On creation/first subscription** - Initial data load from server
2. **On user request** - `refreshFiles()` action called by UI
3. **On SSE events** - Updates applied in real-time (no separate fetch needed)

**Fetch Implementation**:
```typescript
async function fetchFiles(): Promise<FileItem[]> {
  const response = await fetch('/api/files');
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error?.message || 'Failed to fetch files');
  }

  return json.data.files;
}
```

**No cache invalidation needed** - SSE provides real-time updates, so file list is always current.

### 4. Upload State Tracking

**Decision**: Track via file `progress` and `status` fields in the store.

**Upload Flow**:
```
User calls store.uploadFile(file)
  ↓
POST /api/files/upload
  ↓
Server returns 202 Accepted with file ID
  ↓
File added to store with status='pending'
  ↓
SSE streams real-time updates
  ↓
Progress bar updates as progress changes
  ↓
Final update: status='ready' or status='failed'
```

**No intermediate states in store** - progress tracked via `progress` and `processing_stage` fields from SSE updates.

### 5. Store API (Public Functions/Stores)

**Main writable store**:
```typescript
export const files: Writable<FileItem[]>
```

**Derived stores** (for common UI filters):
```typescript
export const processingFiles: Derived<FileItem[]>  // status='processing' OR status='pending'
export const readyFiles: Derived<FileItem[]>       // status='ready'
export const failedFiles: Derived<FileItem[]>      // status='failed'
```

**Action functions**:
```typescript
// Upload a new file
export async function uploadFile(file: File): Promise<string>
// Returns: file ID from server

// Delete an existing file
export async function deleteFile(id: string): Promise<void>
// Returns: void on success, throws on error

// Manually refresh file list from server
export async function refreshFiles(): Promise<void>
// Fetches latest from /api/files and updates store
```

**Utility functions** (optional, for UI convenience):
```typescript
// Get single file by ID
export function getFile(id: string): FileItem | undefined

// Get file by filename
export function getFileByName(filename: string): FileItem | undefined

// Check if file is still processing
export function isProcessing(id: string): boolean
```

### 6. Error Handling

**Decision**: Separate error state in store, not thrown from actions.

**Error State**:
```typescript
export const error: Writable<string | null>
```

**Error Scenarios**:

| Scenario | Handling |
|----------|----------|
| Upload fails (network) | Error logged to console, `error` store set, file not added to list |
| Upload fails (validation) | Error from API returned to caller via exception |
| Delete fails | `error` store set, file remains in list |
| Fetch fails | `error` store set, existing files remain |
| SSE disconnects | Auto-reconnect (up to 5 times), heartbeat detects connection loss |

**Error Display**:
- UI component subscribes to `error` store
- Displays toast/snackbar for 5 seconds
- Auto-clears after 5 seconds or user dismissal

### 7. TypeScript Types

**Decision**: Define types in `src/lib/stores/files.ts` to keep store self-contained.

```typescript
// From API (matches Chunk 6 response)
export interface FileItem {
  id: string;
  filename: string;
  file_type: FileType;
  status: FileStatus;
  progress: number;
  processing_stage: ProcessingStage | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// Domain types
export type FileStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type ProcessingStage = 'extraction' | 'compression' | 'embedding' | 'finalization';
export type FileType = 'pdf' | 'image' | 'text' | 'code' | 'spreadsheet' | 'other';

// Store action return types
export interface UploadResult {
  id: string;
  filename: string;
}
```

## Implementation

### File: `src/lib/stores/files.ts`

**Purpose**: Complete Svelte store for file management with SSE integration

**Complete Implementation**:

```typescript
import { writable, derived, type Writable, type Derived } from 'svelte/store';

// ============================================================================
// TYPES
// ============================================================================

export type FileStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type ProcessingStage = 'extraction' | 'compression' | 'embedding' | 'finalization';
export type FileType = 'pdf' | 'image' | 'text' | 'code' | 'spreadsheet' | 'other';

export interface FileItem {
	id: string;
	filename: string;
	file_type: FileType;
	status: FileStatus;
	progress: number;
	processing_stage: ProcessingStage | null;
	error_message: string | null;
	created_at: string;
	updated_at: string;
}

// ============================================================================
// INTERNAL STATE
// ============================================================================

/**
 * Main writable store for files list
 */
export const files: Writable<FileItem[]> = writable([]);

/**
 * Error message store
 */
export const error: Writable<string | null> = writable(null);

/**
 * SSE connection state
 */
let eventSource: EventSource | null = null;
let subscriberCount = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectAttempts = 0;
let reconnectTimeout: NodeJS.Timeout | null = null;

// ============================================================================
// DERIVED STORES (for common UI filters)
// ============================================================================

/**
 * Files currently processing (pending or processing status)
 */
export const processingFiles: Derived<FileItem[]> = derived(files, ($files) => {
	return $files.filter((f) => f.status === 'pending' || f.status === 'processing');
});

/**
 * Files ready for use
 */
export const readyFiles: Derived<FileItem[]> = derived(files, ($files) => {
	return $files.filter((f) => f.status === 'ready');
});

/**
 * Files that failed to process
 */
export const failedFiles: Derived<FileItem[]> = derived(files, ($files) => {
	return $files.filter((f) => f.status === 'failed');
});

// ============================================================================
// PUBLIC ACTIONS
// ============================================================================

/**
 * Upload a new file to the server
 * @param file - File object from input element
 * @returns File ID from server
 * @throws Error if upload fails
 */
export async function uploadFile(file: File): Promise<string> {
	try {
		clearError();

		// Validate input
		if (!file || !(file instanceof File)) {
			throw new Error('Invalid file object');
		}

		// Create form data and upload
		const formData = new FormData();
		formData.append('file', file);

		const response = await fetch('/api/files/upload', {
			method: 'POST',
			body: formData
		});

		const json = await response.json();

		if (!response.ok) {
			throw new Error(json.error?.message || 'Upload failed');
		}

		// Add pending file to store immediately (will update via SSE)
		const newFile: FileItem = {
			id: json.data.id || crypto.randomUUID(),
			filename: file.name,
			file_type: inferFileType(file.name),
			status: 'pending',
			progress: 0,
			processing_stage: null,
			error_message: null,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		files.update((current) => [newFile, ...current]);

		return newFile.id;
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		setError(`Upload failed: ${message}`);
		throw new Error(message);
	}
}

/**
 * Delete a file by ID
 * @param id - File ID to delete
 * @throws Error if deletion fails
 */
export async function deleteFile(id: string): Promise<void> {
	try {
		clearError();

		const response = await fetch(`/api/files/${id}`, {
			method: 'DELETE'
		});

		const json = await response.json();

		if (!response.ok) {
			throw new Error(json.error?.message || 'Delete failed');
		}

		// Remove from store (SSE will also send delete event)
		files.update((current) => current.filter((f) => f.id !== id));
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		setError(`Delete failed: ${message}`);
		throw new Error(message);
	}
}

/**
 * Manually refresh file list from server
 * Useful for: manual sync, after network recovery, etc.
 */
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

// ============================================================================
// UTILITY FUNCTIONS (for UI convenience)
// ============================================================================

/**
 * Get a single file by ID
 */
export function getFile(id: string): FileItem | undefined {
	let result: FileItem | undefined;
	files.subscribe((current) => {
		result = current.find((f) => f.id === id);
	})();
	return result;
}

/**
 * Get file by filename
 */
export function getFileByName(filename: string): FileItem | undefined {
	let result: FileItem | undefined;
	files.subscribe((current) => {
		result = current.find((f) => f.filename === filename);
	})();
	return result;
}

/**
 * Check if file is still processing
 */
export function isProcessing(id: string): boolean {
	let result = false;
	files.subscribe((current) => {
		const file = current.find((f) => f.id === id);
		result = file ? file.status === 'pending' || file.status === 'processing' : false;
	})();
	return result;
}

// ============================================================================
// SSE CONNECTION MANAGEMENT
// ============================================================================

/**
 * Set up SSE connection (call once on first subscriber)
 */
function connectSSE(): void {
	if (eventSource) return; // Already connected

	console.log('[Files Store] Connecting to SSE...');

	eventSource = new EventSource('/api/files/events');

	// Handle incoming events
	eventSource.addEventListener('message', (event) => {
		try {
			const data = JSON.parse(event.data);
			handleSSEEvent(data);
		} catch (err) {
			console.error('[Files Store] Failed to parse SSE event:', err);
		}
	});

	// Handle connection open
	eventSource.onopen = () => {
		console.log('[Files Store] SSE connected');
		reconnectAttempts = 0; // Reset reconnect counter on success
	};

	// Handle connection errors
	eventSource.onerror = (err) => {
		console.error('[Files Store] SSE error:', err);
		disconnectSSE();

		// Attempt reconnection
		if (subscriberCount > 0) {
			reconnect();
		}
	};
}

/**
 * Disconnect SSE connection (call when last subscriber unsubscribes)
 */
function disconnectSSE(): void {
	if (!eventSource) return;

	console.log('[Files Store] Disconnecting SSE...');
	eventSource.close();
	eventSource = null;

	// Clear any pending reconnect timeout
	if (reconnectTimeout) {
		clearTimeout(reconnectTimeout);
		reconnectTimeout = null;
	}
}

/**
 * Reconnect to SSE with exponential backoff
 */
function reconnect(): void {
	if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
		setError('Connection lost. Please refresh the page.');
		console.error('[Files Store] Max reconnection attempts reached');
		return;
	}

	reconnectAttempts++;
	const delayMs = 1000 * Math.pow(2, reconnectAttempts - 1); // 1s, 2s, 4s, 8s, 16s

	console.log(`[Files Store] Reconnecting in ${delayMs}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

	reconnectTimeout = setTimeout(() => {
		connectSSE();
	}, delayMs);
}

/**
 * Handle incoming SSE events
 */
function handleSSEEvent(data: any): void {
	const { eventType, file } = data;

	if (eventType === 'file-update' && file) {
		// Update or insert file
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
	} else if (eventType === 'file-deleted' && file?.id) {
		// Remove file
		files.update((current) => current.filter((f) => f.id !== file.id));
	} else if (eventType === 'heartbeat') {
		// Heartbeat - connection is alive, no action needed
		// Could set "connected" indicator here if desired
	}
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Fetch files from server
 */
async function fetchFiles(): Promise<FileItem[]> {
	const response = await fetch('/api/files');
	const json = await response.json();

	if (!response.ok) {
		throw new Error(json.error?.message || 'Failed to fetch files');
	}

	return json.data.files || [];
}

/**
 * Infer file type from filename
 */
function inferFileType(filename: string): FileType {
	const ext = filename.split('.').pop()?.toLowerCase() || '';

	// PDF
	if (ext === 'pdf') return 'pdf';

	// Images
	if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';

	// Code
	if (['js', 'ts', 'py', 'tsx', 'jsx', 'go', 'rs', 'java', 'cpp', 'c'].includes(ext)) return 'code';

	// Spreadsheets
	if (['xlsx', 'xls', 'csv'].includes(ext)) return 'spreadsheet';

	// Text/Markdown
	if (['txt', 'md', 'markdown'].includes(ext)) return 'text';

	// Default
	return 'other';
}

/**
 * Set error message (with auto-clear after 5 seconds)
 */
function setError(message: string): void {
	error.set(message);
	setTimeout(() => {
		error.set(null);
	}, 5000);
}

/**
 * Clear error message
 */
function clearError(): void {
	error.set(null);
}

// ============================================================================
// STORE SUBSCRIPTION LIFECYCLE (auto-connect/disconnect)
// ============================================================================

/**
 * Override store subscription to manage SSE connection
 * This is called by Svelte when a component subscribes to any of our stores
 */

// Track subscriptions to main files store
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

	// Call original subscribe
	const unsubscribe = originalFilesSubscribe(fn);

	// Return wrapped unsubscribe
	return () => {
		subscriberCount--;

		if (subscriberCount === 0) {
			// Last subscriber unsubscribed - disconnect SSE
			disconnectSSE();
		}

		unsubscribe();
	};
};

// Also track subscriptions to derived stores (they subscribe to files internally)
// This ensures we stay connected when only derived stores are subscribed
processingFiles.subscribe;
readyFiles.subscribe;
failedFiles.subscribe;
```

## Testing Strategy

### 1. Manual Testing (Browser/UI)

**Setup**:
- Start dev server: `npm run dev`
- Open app in browser
- Open DevTools Console and Network tabs

**Test: Initial Load**
1. Navigate to app
2. Verify in Console: `[Files Store] Connecting to SSE...` logged
3. Verify in Network: `GET /api/files` succeeds
4. Verify in Network: `GET /api/files/events` opens (event stream)
5. Verify in Console: `[Files Store] SSE connected` logged
6. Verify UI shows existing files (if any)

**Test: Upload File**
1. Use file input to upload a PDF
2. Verify: File appears in list immediately with status='pending'
3. Verify in Console: SSE events received (file-update with progress)
4. Verify: Progress bar updates (0% → 100%)
5. Verify: Status changes to 'ready' when complete
6. Verify in Network: POST /api/files/upload succeeds

**Test: File Processing Progress**
1. Upload large file (~5MB)
2. Watch progress bar update through stages:
   - extraction (0-25%)
   - compression (25-75%)
   - embedding (75-90%)
   - finalization (90-100%)
3. Verify stage text displays correctly

**Test: Multiple Files**
1. Upload 2-3 files simultaneously
2. Verify: All files appear in list
3. Verify: Each has independent progress tracking
4. Verify: SSE streams all updates without interference

**Test: Delete File**
1. Upload a file and let it complete (status='ready')
2. Click delete button
3. Verify: Confirmation dialog appears
4. Click confirm
5. Verify: DELETE /api/files/[id] succeeds
6. Verify: File disappears from list immediately
7. Verify: SSE sends file-deleted event

**Test: Refresh Files**
1. Open DevTools Network tab
2. Click "Refresh" button (if UI has one)
3. Verify: GET /api/files called
4. Verify: File list updates from server

**Test: Error Handling**
1. Simulate network error:
   - DevTools → Network tab → Offline
   - Try to upload file
   - Verify: Error message displayed
   - Verify: Error clears after 5 seconds
2. Go online again
3. Verify: Can upload successfully

**Test: SSE Reconnection**
1. Start with SSE connected
2. Simulate connection loss:
   - DevTools → Network → Offline
   - Verify in Console: `[Files Store] SSE error` logged
   - Verify: `[Files Store] Reconnecting in ...ms` logged
3. Go online
4. Verify: Reconnection succeeds
5. Verify: Console shows `[Files Store] SSE connected`

**Test: Heartbeat**
1. Wait 30+ seconds while idle
2. Verify in Network tab: heartbeat events received periodically
3. Verify: No `[Files Store] SSE error` logged (connection alive)

### 2. Integration Testing (if needed)

**Vitest test example** (skeleton for future implementation):

```typescript
import { render, waitFor } from '@testing-library/svelte';
import { files, uploadFile, deleteFile, refreshFiles } from '$lib/stores/files';

describe('Files Store', () => {
  // Mock fetch
  global.fetch = vi.fn();

  it('should fetch initial files on first subscription', async () => {
    // Set up mock
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { files: [{ id: '1', filename: 'test.pdf', ... }] }
      })
    });

    // Subscribe (triggers fetch)
    let fileList;
    const unsubscribe = files.subscribe(val => { fileList = val; });

    // Verify fetch was called
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/files');
    });

    unsubscribe();
  });

  // ... more tests for uploadFile, deleteFile, etc.
});
```

## Integration Points

### With Chunk 6 (API Endpoints)
- **GET /api/files**: Called on mount to fetch initial file list
- **POST /api/files/upload**: Called when `uploadFile()` invoked
- **DELETE /api/files/[id]**: Called when `deleteFile()` invoked
- Uses same `FileItem` structure as API response

### With Chunk 7 (Server-Sent Events)
- **GET /api/files/events**: Connected on first subscription
- Receives: `file-update`, `file-deleted`, `heartbeat` events
- Updates store state in real-time as events arrive
- Disconnects when last subscriber unsubscribes

### With Chunk 9 (UI Integration)
- **Subscribers**: Components import store: `import { files, processingFiles, readyFiles, failedFiles, deleteFile, uploadFile } from '$lib/stores/files'`
- **Reactivity**: Store updates automatically trigger component re-renders
- **Error display**: Component subscribes to `error` store for error messages
- **Derived stores**: Components use filtered stores for progress bars, file lists, etc.

### With Chunk 10 (Context Injection)
- **Read access**: Context builder can import `files` store to access ready files
- **File descriptions**: Can access `file.description` field from file objects
- No write access needed (only store reads)

## Success Criteria

- [x] Store created with TypeScript interfaces
- [x] Files writable store holds FileItem[] with proper typing
- [x] Derived stores filter: processingFiles, readyFiles, failedFiles
- [x] SSE connection auto-connects on first subscriber
- [x] SSE connection auto-disconnects when all unsubscribe
- [x] Real-time file updates from SSE events (file-update, file-deleted)
- [x] Upload progress tracked (0-100%)
- [x] Processing stages tracked (extraction → compression → embedding → finalization)
- [x] `uploadFile()` action: adds file to store, calls API
- [x] `deleteFile()` action: removes file from store, calls API
- [x] `refreshFiles()` action: fetches latest from server
- [x] Error handling: error store, auto-clear after 5s
- [x] SSE reconnection with exponential backoff (max 5 attempts)
- [x] Heartbeat handling (30s interval, no-op)
- [x] File type inference from filename
- [x] Utility functions: getFile(), getFileByName(), isProcessing()
- [x] No hardcoded values (all URLs, timeouts dynamic or constants)
- [x] TypeScript compilation: no errors
- [x] Store is self-contained (imports minimal dependencies)

## Edge Cases & Error Handling

### SSE Connection Failures
1. **Network down on startup**: Initial fetch fails, SSE doesn't connect
   - **Handling**: Log error, show empty list, user can retry via refreshFiles()
2. **SSE drops mid-upload**: Upload completes via API but progress updates miss
   - **Handling**: Auto-reconnect, file will be in final state when reconnected
3. **Realtime subscription timeout**: Supabase subscription fails
   - **Handling**: SSE stream stays open but no events received, auto-reconnect

### Upload Failures
1. **File too large (>10MB)**: API returns 413
   - **Handling**: Exception thrown, error message shown
2. **Network error during upload**: Fetch fails
   - **Handling**: Exception thrown, error message shown, file not added to list
3. **Duplicate file (same content hash)**: API returns 400
   - **Handling**: Exception thrown, error message shown

### Delete Failures
1. **File not found**: API returns 404
   - **Handling**: Error message shown, file removed from list anyway
2. **Network error**: Fetch fails
   - **Handling**: Error message shown, file remains in list

### Store Subscription Edge Cases
1. **Multiple components subscribe**: All share same SSE connection
   - **Handling**: subscriberCount tracks all, connection stays open until all unsub
2. **Component unmounts mid-fetch**: Initial fetch completes but no subscriber
   - **Handling**: No-op, data stored but not used (will be fetched again on next sub)
3. **Rapid subscribe/unsubscribe**: Race condition on connect/disconnect
   - **Handling**: subscriberCount prevents double-connect, timeout prevents premature disconnect

## No Hardcoding

- ✓ API endpoints: `/api/files`, `/api/files/upload`, `/api/files/events` (standard paths from Chunk 6/7)
- ✓ File type inference: Maps common extensions to types (not hardcoded per file)
- ✓ Error auto-clear timeout: 5000ms (domain constant)
- ✓ SSE reconnect timeout: 1000ms base, exponential backoff (domain constants)
- ✓ SSE heartbeat interval: 30s (set by server, client listens)
- ✓ Max reconnect attempts: 5 (domain constant)
- ✓ User ID: Not used (SSE/API handle user filtering server-side)

## Notes

1. **Auto-subscription lifecycle**: The store automatically connects to SSE on first subscriber and disconnects when all unsubscribe. This is a Svelte pattern that minimizes resources and ensures cleanup.

2. **Derived stores**: `processingFiles`, `readyFiles`, `failedFiles` are computed properties that automatically update when the main `files` store changes. Components can subscribe to these instead of filtering manually.

3. **Fire-and-forget updates**: When file is uploaded, it's added to store immediately with `status='pending'`. SSE events update progress/status in real-time. No polling needed.

4. **Connection resilience**: If SSE drops, the store auto-reconnects with exponential backoff. If max retries exceeded, error is shown but store remains functional (UI can call `refreshFiles()` manually).

5. **No state normalization**: Files stored as flat array (not normalized by ID). For large file lists (100+), consider using Map internally for faster lookups, but for typical use (5-50 files), array is fine.

6. **EventSource polyfill**: Standard EventSource API used. For IE11 support, include polyfill (not needed for modern browsers).

7. **Type safety**: All types match Chunk 6 API response format. If API schema changes, update types here and all usages auto-update.

