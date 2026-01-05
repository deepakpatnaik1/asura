/**
 * Tests for lib/stores/connectivity.ts
 *
 * Tests the connectivity detection store for offline handling.
 * Note: Server health is now handled by ServerStatusLED component (visual indicator only)
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
import { isOnline, isConnected } from '$lib/stores/connectivity';

describe('connectivity stores', () => {
	beforeEach(() => {
		mockNavigator.onLine = true;
		isOnline.set(true);
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

	describe('isConnected (derived)', () => {
		it('is true when isOnline is true', () => {
			isOnline.set(true);
			expect(get(isConnected)).toBe(true);
		});

		it('is false when isOnline is false', () => {
			isOnline.set(false);
			expect(get(isConnected)).toBe(false);
		});
	});
});
