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

// Initialize browser event listeners (only runs in browser)
if (typeof window !== 'undefined') {
	// Set initial value from browser
	isOnline.set(navigator.onLine);

	window.addEventListener('online', () => {
		isOnline.set(true);
		// When coming back online, check API connectivity
		checkApiConnectivity();
	});

	window.addEventListener('offline', () => {
		isOnline.set(false);
		isApiReachable.set(false);
	});
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
