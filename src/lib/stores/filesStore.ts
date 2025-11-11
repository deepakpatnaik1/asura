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
// UTILITY FUNCTIONS (for occasional lookups, not frequent access)
// ============================================================================

/**
 * Get a single file by ID
 *
 * NOTE: This function is intended for OCCASIONAL lookups only (e.g., when user
 * clicks on a single file). For components that need repeated access to specific
 * files, create a derived store instead for better performance.
 *
 * @example
 * // Occasional lookup - fine
 * const file = getFile(fileId);
 *
 * // Frequent access - better to use derived store
 * export const selectedFile = derived(files, ($files, set) => {
 *   set($files.find(f => f.id === selectedFileId));
 * });
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
 *
 * NOTE: This function is intended for OCCASIONAL lookups only.
 * See getFile() documentation for performance considerations.
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
 *
 * NOTE: This function is intended for OCCASIONAL lookups only.
 * See getFile() documentation for performance considerations.
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
 *
 * Uses exponential backoff strategy:
 * - Attempt 1: Wait 1 second (1000ms)
 * - Attempt 2: Wait 2 seconds (2000ms)
 * - Attempt 3: Wait 4 seconds (4000ms)
 * - Attempt 4: Wait 8 seconds (8000ms)
 * - Attempt 5: Wait 16 seconds (16000ms)
 *
 * After 5 failed attempts, reconnection stops and an error is displayed.
 * User can manually retry via refreshFiles() action.
 */
function reconnect(): void {
	if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
		setError('Connection lost. Please refresh the page.');
		console.error('[Files Store] Max reconnection attempts reached');
		return;
	}

	reconnectAttempts++;
	const delayMs = 1000 * Math.pow(2, reconnectAttempts - 1); // Exponential backoff: 1s, 2s, 4s, 8s, 16s

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
 * This is called by Svelte when a component subscribes to the files store
 *
 * Pattern:
 * - First subscriber: Fetch initial files and connect to SSE
 * - Subsequent subscribers: Share the same SSE connection
 * - Last unsubscriber: Disconnect SSE (resource cleanup)
 *
 * Note: Derived stores (processingFiles, readyFiles, failedFiles) automatically
 * subscribe to the files store internally, so they will correctly increment/decrement
 * the subscriber count and keep the SSE connection alive.
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
