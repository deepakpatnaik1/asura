import { writable, derived } from 'svelte/store';

/** Whether the browser reports being online */
export const isOnline = writable(true);

/** Whether we've confirmed connectivity to our API */
export const isApiReachable = writable(true);

/** Combined connectivity status */
export const isConnected = derived(
	[isOnline, isApiReachable],
	([$isOnline, $isApiReachable]) => $isOnline && $isApiReachable
);

// Event handlers (stored for cleanup)
function handleOnline() {
	isOnline.set(true);
	checkApiConnectivity();
}

function handleOffline() {
	isOnline.set(false);
	isApiReachable.set(false);
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

/**
 * Check if our API is reachable by hitting the health endpoint
 * @returns true if API is reachable
 */
export async function checkApiConnectivity(): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);

		const response = await fetch('/api/health', {
			method: 'GET',
			signal: controller.signal
		});

		clearTimeout(timeoutId);

		const reachable = response.ok;
		isApiReachable.set(reachable);
		return reachable;
	} catch {
		isApiReachable.set(false);
		return false;
	}
}
