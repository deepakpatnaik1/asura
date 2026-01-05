import { writable, derived } from 'svelte/store';

/** Whether the browser reports being online */
export const isOnline = writable(true);

/**
 * Combined connectivity status
 * Only tracks browser online/offline status
 * Server health is shown by ServerStatusLED component (visual indicator only)
 */
export const isConnected = derived(isOnline, ($isOnline) => $isOnline);

// Event handlers
function handleOnline() {
	isOnline.set(true);
}

function handleOffline() {
	isOnline.set(false);
}

let listenersInitialized = false;

/** Initialize connectivity listeners (call from root layout) */
export function initConnectivityListeners(): void {
	if (typeof window === 'undefined' || listenersInitialized) return;

	isOnline.set(navigator.onLine);
	window.addEventListener('online', handleOnline);
	window.addEventListener('offline', handleOffline);

	listenersInitialized = true;
}

/** Cleanup connectivity listeners (call on unmount) */
export function cleanupConnectivityListeners(): void {
	if (typeof window === 'undefined' || !listenersInitialized) return;

	window.removeEventListener('online', handleOnline);
	window.removeEventListener('offline', handleOffline);

	listenersInitialized = false;
}
