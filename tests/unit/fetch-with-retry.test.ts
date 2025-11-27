/**
 * Tests for lib/utils/fetch-with-retry.ts
 *
 * Tests the retry and timeout utilities for client-side fetch requests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry, fetchWithTimeout } from '$lib/utils/fetch-with-retry';

describe('fetchWithRetry', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe('successful requests', () => {
		it('returns response on first successful attempt', async () => {
			const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
			vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

			const resultPromise = fetchWithRetry('/api/test');
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.response.ok).toBe(true);
			expect(result.attempts).toBe(1);
			expect(fetch).toHaveBeenCalledTimes(1);
		});

		it('returns response after retry on 503', async () => {
			const errorResponse = new Response('Service Unavailable', { status: 503 });
			const successResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });

			vi.spyOn(global, 'fetch')
				.mockResolvedValueOnce(errorResponse)
				.mockResolvedValueOnce(successResponse);

			const resultPromise = fetchWithRetry('/api/test', {}, { baseDelayMs: 100, maxRetries: 3 });
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.response.ok).toBe(true);
			expect(result.attempts).toBe(2);
			expect(fetch).toHaveBeenCalledTimes(2);
		});
	});

	describe('client errors (4xx)', () => {
		it('does not retry on 400 Bad Request', async () => {
			const errorResponse = new Response('Bad Request', { status: 400 });
			vi.spyOn(global, 'fetch').mockResolvedValueOnce(errorResponse);

			const resultPromise = fetchWithRetry('/api/test');
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.response.status).toBe(400);
			expect(result.attempts).toBe(1);
			expect(fetch).toHaveBeenCalledTimes(1);
		});

		it('does not retry on 401 Unauthorized', async () => {
			const errorResponse = new Response('Unauthorized', { status: 401 });
			vi.spyOn(global, 'fetch').mockResolvedValueOnce(errorResponse);

			const resultPromise = fetchWithRetry('/api/test');
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.response.status).toBe(401);
			expect(result.attempts).toBe(1);
		});

		it('does not retry on 404 Not Found', async () => {
			const errorResponse = new Response('Not Found', { status: 404 });
			vi.spyOn(global, 'fetch').mockResolvedValueOnce(errorResponse);

			const resultPromise = fetchWithRetry('/api/test');
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.response.status).toBe(404);
			expect(result.attempts).toBe(1);
		});
	});

	describe('server errors (5xx)', () => {
		it('retries on 502 Bad Gateway', async () => {
			const errorResponse = new Response('Bad Gateway', { status: 502 });
			vi.spyOn(global, 'fetch').mockResolvedValue(errorResponse);

			const resultPromise = fetchWithRetry('/api/test', {}, { maxRetries: 3, baseDelayMs: 100 });
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.response.status).toBe(502);
			expect(result.attempts).toBe(3);
			expect(fetch).toHaveBeenCalledTimes(3);
		});

		it('retries on 503 Service Unavailable', async () => {
			const errorResponse = new Response('Service Unavailable', { status: 503 });
			vi.spyOn(global, 'fetch').mockResolvedValue(errorResponse);

			const resultPromise = fetchWithRetry('/api/test', {}, { maxRetries: 2, baseDelayMs: 100 });
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.response.status).toBe(503);
			expect(result.attempts).toBe(2);
		});

		it('retries on 504 Gateway Timeout', async () => {
			const errorResponse = new Response('Gateway Timeout', { status: 504 });
			vi.spyOn(global, 'fetch').mockResolvedValue(errorResponse);

			const resultPromise = fetchWithRetry('/api/test', {}, { maxRetries: 2, baseDelayMs: 100 });
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.response.status).toBe(504);
			expect(result.attempts).toBe(2);
		});

		it('does not retry on 500 Internal Server Error by default', async () => {
			const errorResponse = new Response('Internal Server Error', { status: 500 });
			vi.spyOn(global, 'fetch').mockResolvedValueOnce(errorResponse);

			const resultPromise = fetchWithRetry('/api/test');
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.response.status).toBe(500);
			expect(result.attempts).toBe(1);
		});

		it('retries on 500 when configured', async () => {
			const errorResponse = new Response('Internal Server Error', { status: 500 });
			vi.spyOn(global, 'fetch').mockResolvedValue(errorResponse);

			const resultPromise = fetchWithRetry(
				'/api/test',
				{},
				{ maxRetries: 2, retryOnStatus: [500], baseDelayMs: 100 }
			);
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.attempts).toBe(2);
		});
	});

	describe('network errors', () => {
		it('retries on network failure', async () => {
			vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

			const resultPromise = fetchWithRetry('/api/test', {}, { maxRetries: 2, baseDelayMs: 100 });

			await expect(vi.runAllTimersAsync().then(() => resultPromise)).rejects.toThrow(
				'Network error'
			);
			expect(fetch).toHaveBeenCalledTimes(2);
		});

		it('succeeds after network recovery', async () => {
			const successResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
			vi.spyOn(global, 'fetch')
				.mockRejectedValueOnce(new Error('Network error'))
				.mockResolvedValueOnce(successResponse);

			const resultPromise = fetchWithRetry('/api/test', {}, { maxRetries: 3, baseDelayMs: 100 });
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.response.ok).toBe(true);
			expect(result.attempts).toBe(2);
		});
	});

	describe('abort handling', () => {
		it('propagates user abort immediately without retry', async () => {
			const controller = new AbortController();
			const abortError = new Error('Aborted');
			abortError.name = 'AbortError';

			vi.spyOn(global, 'fetch').mockImplementation(async (_url, options) => {
				// Check if already aborted
				if ((options as RequestInit)?.signal?.aborted) {
					throw abortError;
				}
				// Simulate abort during request
				controller.abort();
				throw abortError;
			});

			const resultPromise = fetchWithRetry('/api/test', { signal: controller.signal });

			await expect(vi.runAllTimersAsync().then(() => resultPromise)).rejects.toThrow('Aborted');
			expect(fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe('configuration', () => {
		it('respects maxRetries configuration', async () => {
			const errorResponse = new Response('Bad Gateway', { status: 502 });
			vi.spyOn(global, 'fetch').mockResolvedValue(errorResponse);

			const resultPromise = fetchWithRetry('/api/test', {}, { maxRetries: 5, baseDelayMs: 100 });
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.attempts).toBe(5);
			expect(fetch).toHaveBeenCalledTimes(5);
		});

		it('passes fetch options correctly', async () => {
			const mockResponse = new Response('OK', { status: 200 });
			const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

			const options = {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ test: true })
			};

			const resultPromise = fetchWithRetry('/api/test', options);
			await vi.runAllTimersAsync();
			await resultPromise;

			expect(fetchSpy).toHaveBeenCalledWith('/api/test', expect.objectContaining(options));
		});
	});
});

describe('fetchWithTimeout', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns response when request completes in time', async () => {
		const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

		const response = await fetchWithTimeout('/api/test', {}, 5000);

		expect(response.ok).toBe(true);
	});

	it('clears timeout on successful response', async () => {
		const mockResponse = new Response('OK', { status: 200 });
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

		const response = await fetchWithTimeout('/api/test', {}, 30000);

		expect(response.ok).toBe(true);
	});

	it('passes abort signal to fetch', async () => {
		const mockResponse = new Response('OK', { status: 200 });
		let capturedSignal: AbortSignal | null | undefined;
		vi.spyOn(global, 'fetch').mockImplementation(async (_url, options) => {
			capturedSignal = (options as RequestInit)?.signal;
			return mockResponse;
		});

		await fetchWithTimeout('/api/test', {}, 5000);

		expect(capturedSignal).toBeDefined();
		expect(capturedSignal?.aborted).toBe(false);
	});

	it('merges user-provided abort signal', async () => {
		const controller = new AbortController();
		const mockResponse = new Response('OK', { status: 200 });
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

		const response = await fetchWithTimeout('/api/test', { signal: controller.signal }, 30000);

		expect(response.ok).toBe(true);
	});
});
