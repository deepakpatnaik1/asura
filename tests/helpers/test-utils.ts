/**
 * Test Utilities
 *
 * Common helper functions for tests.
 */

import { vi } from 'vitest';

/**
 * Wait for a specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
	condition: () => boolean,
	options: { timeout?: number; interval?: number } = {}
): Promise<void> {
	const { timeout = 5000, interval = 50 } = options;
	const startTime = Date.now();

	while (!condition()) {
		if (Date.now() - startTime > timeout) {
			throw new Error(`Timeout waiting for condition after ${timeout}ms`);
		}
		await wait(interval);
	}
}

/**
 * Create a mock function that resolves after a delay
 */
export function createDelayedMock<T>(
	returnValue: T,
	delayMs: number = 100
): ReturnType<typeof vi.fn> {
	return vi.fn().mockImplementation(
		() =>
			new Promise((resolve) => {
				setTimeout(() => resolve(returnValue), delayMs);
			})
	);
}

/**
 * Create a mock function that rejects with an error
 */
export function createErrorMock(error: Error): ReturnType<typeof vi.fn> {
	return vi.fn().mockRejectedValue(error);
}

/**
 * Capture console output during a test
 */
export function captureConsole(): {
	logs: string[];
	errors: string[];
	warns: string[];
	restore: () => void;
} {
	const logs: string[] = [];
	const errors: string[] = [];
	const warns: string[] = [];

	const originalLog = console.log;
	const originalError = console.error;
	const originalWarn = console.warn;

	console.log = (...args) => logs.push(args.join(' '));
	console.error = (...args) => errors.push(args.join(' '));
	console.warn = (...args) => warns.push(args.join(' '));

	const restore = () => {
		console.log = originalLog;
		console.error = originalError;
		console.warn = originalWarn;
	};

	return { logs, errors, warns, restore };
}

/**
 * Mock the current date/time
 */
export function mockDate(date: string | Date): () => void {
	const mockDate = new Date(date);
	const originalNow = Date.now;
	const originalDate = global.Date;

	global.Date.now = vi.fn(() => mockDate.getTime());
	(global as any).Date = class extends Date {
		constructor(...args: any[]) {
			if (args.length === 0) {
				super(mockDate.getTime());
			} else {
				super(args[0]);
			}
		}
	};

	return () => {
		global.Date.now = originalNow;
		global.Date = originalDate;
	};
}

/**
 * Generate a random test ID
 */
export function generateTestId(prefix: string = 'test'): string {
	return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(value: T | null | undefined, message?: string): asserts value is T {
	if (value === null || value === undefined) {
		throw new Error(message || 'Expected value to be defined');
	}
}

/**
 * Create a mock FormData object
 */
export function createMockFormData(entries: Record<string, any>): FormData {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		if (Array.isArray(value)) {
			value.forEach((item) => formData.append(key, item));
		} else {
			formData.append(key, value);
		}
	}
	return formData;
}

/**
 * Create a mock Request object
 */
export function createMockRequest(
	url: string,
	init?: RequestInit & { body?: any }
): Request {
	return new Request(url, init);
}

/**
 * Create a mock Response object
 */
export function createMockResponse(
	body: any,
	init?: ResponseInit
): Response {
	return new Response(JSON.stringify(body), {
		headers: { 'Content-Type': 'application/json' },
		...init
	});
}

/**
 * Mock environment variables
 */
export function mockEnv(vars: Record<string, string>): () => void {
	const original: Record<string, string | undefined> = {};

	for (const [key, value] of Object.entries(vars)) {
		original[key] = process.env[key];
		process.env[key] = value;
	}

	return () => {
		for (const [key, value] of Object.entries(original)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	};
}

/**
 * Create a readable stream from chunks
 */
export function createMockReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let index = 0;

	return new ReadableStream({
		pull(controller) {
			if (index < chunks.length) {
				controller.enqueue(encoder.encode(chunks[index]));
				index++;
			} else {
				controller.close();
			}
		}
	});
}
