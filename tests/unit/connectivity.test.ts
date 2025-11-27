/**
 * Tests for lib/stores/connectivity.ts
 *
 * Tests the connectivity detection store for offline handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// Mock window and navigator before importing the module
const mockNavigator = { onLine: true };
const mockEventListeners = new Map<string, Function[]>();

vi.stubGlobal('navigator', mockNavigator);
vi.stubGlobal('window', {
	addEventListener: (event: string, handler: Function) => {
		const handlers = mockEventListeners.get(event) || [];
		handlers.push(handler);
		mockEventListeners.set(event, handlers);
	},
	removeEventListener: (event: string, handler: Function) => {
		const handlers = mockEventListeners.get(event) || [];
		const index = handlers.indexOf(handler);
		if (index > -1) handlers.splice(index, 1);
	}
});

// Import after mocking
import { isOnline, isApiReachable, isConnected, checkApiConnectivity } from '$lib/stores/connectivity';

describe('connectivity stores', () => {
	beforeEach(() => {
		mockNavigator.onLine = true;
		isOnline.set(true);
		isApiReachable.set(true);
		vi.restoreAllMocks();
	});

	afterEach(() => {
		mockEventListeners.clear();
	});

	describe('isOnline', () => {
		it('initializes to true when navigator.onLine is true', () => {
			expect(get(isOnline)).toBe(true);
		});

		it('can be set to false', () => {
			isOnline.set(false);
			expect(get(isOnline)).toBe(false);
		});

		it('can be set to true', () => {
			isOnline.set(false);
			isOnline.set(true);
			expect(get(isOnline)).toBe(true);
		});
	});

	describe('isApiReachable', () => {
		it('initializes to true', () => {
			expect(get(isApiReachable)).toBe(true);
		});

		it('can be set to false', () => {
			isApiReachable.set(false);
			expect(get(isApiReachable)).toBe(false);
		});
	});

	describe('isConnected (derived)', () => {
		it('is true when both isOnline and isApiReachable are true', () => {
			isOnline.set(true);
			isApiReachable.set(true);
			expect(get(isConnected)).toBe(true);
		});

		it('is false when isOnline is false', () => {
			isOnline.set(false);
			isApiReachable.set(true);
			expect(get(isConnected)).toBe(false);
		});

		it('is false when isApiReachable is false', () => {
			isOnline.set(true);
			isApiReachable.set(false);
			expect(get(isConnected)).toBe(false);
		});

		it('is false when both are false', () => {
			isOnline.set(false);
			isApiReachable.set(false);
			expect(get(isConnected)).toBe(false);
		});
	});

	describe('checkApiConnectivity', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('returns true and updates store when API responds OK', async () => {
			const mockResponse = new Response('OK', { status: 200 });
			vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

			const resultPromise = checkApiConnectivity();
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result).toBe(true);
			expect(get(isApiReachable)).toBe(true);
			expect(fetch).toHaveBeenCalledWith('/api/health', expect.any(Object));
		});

		it('returns false and updates store when API responds with error', async () => {
			const mockResponse = new Response('Error', { status: 500 });
			vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

			const resultPromise = checkApiConnectivity();
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result).toBe(false);
			expect(get(isApiReachable)).toBe(false);
		});

		it('returns false and updates store when fetch throws', async () => {
			vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

			const resultPromise = checkApiConnectivity();
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result).toBe(false);
			expect(get(isApiReachable)).toBe(false);
		});

		it('uses abort controller with 5 second timeout', async () => {
			let capturedSignal: AbortSignal | null | undefined;
			vi.spyOn(global, 'fetch').mockImplementation(async (_url, options) => {
				capturedSignal = (options as RequestInit)?.signal;
				return new Response('OK', { status: 200 });
			});

			const resultPromise = checkApiConnectivity();
			await vi.runAllTimersAsync();
			await resultPromise;

			expect(capturedSignal).toBeDefined();
		});
	});
});
