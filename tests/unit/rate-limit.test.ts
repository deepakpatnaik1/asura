/**
 * Tests for lib/api/rate-limit.ts
 *
 * Tests the rate limiting utility with sliding window algorithm.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit, waitForRateLimit, RATE_LIMITS } from '$lib/api/rate-limit';

describe('checkRateLimit', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('under limit', () => {
		it('allows first request', () => {
			const result = checkRateLimit('user-1', RATE_LIMITS.ai);

			expect(result.allowed).toBe(true);
		});

		it('allows requests up to the limit', () => {
			const config = { maxRequests: 3, windowMs: 60000 };

			const result1 = checkRateLimit('user-2', config);
			const result2 = checkRateLimit('user-2', config);
			const result3 = checkRateLimit('user-2', config);

			expect(result1.allowed).toBe(true);
			expect(result2.allowed).toBe(true);
			expect(result3.allowed).toBe(true);
		});

		it('tracks requests per user separately', () => {
			const config = { maxRequests: 1, windowMs: 60000 };

			const resultA = checkRateLimit('user-a', config);
			const resultB = checkRateLimit('user-b', config);

			expect(resultA.allowed).toBe(true);
			expect(resultB.allowed).toBe(true);
		});
	});

	describe('at limit', () => {
		it('blocks request when at limit', () => {
			const config = { maxRequests: 1, windowMs: 60000 };

			checkRateLimit('user-3', config); // First request allowed
			const result = checkRateLimit('user-3', config); // Second blocked

			expect(result.allowed).toBe(false);
		});

		it('returns 429 status code', () => {
			const config = { maxRequests: 1, windowMs: 60000 };

			checkRateLimit('user-4', config);
			const result = checkRateLimit('user-4', config);

			expect(result.allowed).toBe(false);
			if (!result.allowed) {
				expect(result.error.status).toBe(429);
			}
		});

		it('returns RATE_LIMITED error code', async () => {
			const config = { maxRequests: 1, windowMs: 60000 };

			checkRateLimit('user-5', config);
			const result = checkRateLimit('user-5', config);

			expect(result.allowed).toBe(false);
			if (!result.allowed) {
				const body = await result.error.json();
				expect(body.error.code).toBe('RATE_LIMITED');
			}
		});

		it('includes Retry-After header', async () => {
			const config = { maxRequests: 1, windowMs: 60000 };

			checkRateLimit('user-6', config);
			const result = checkRateLimit('user-6', config);

			expect(result.allowed).toBe(false);
			if (!result.allowed) {
				const retryAfter = result.error.headers.get('Retry-After');
				expect(retryAfter).toBeDefined();
				expect(parseInt(retryAfter!)).toBeGreaterThan(0);
			}
		});

		it('calculates correct retry time', () => {
			const config = { maxRequests: 1, windowMs: 60000 };

			checkRateLimit('user-7', config);

			// Advance time by 30 seconds
			vi.advanceTimersByTime(30000);

			const result = checkRateLimit('user-7', config);

			expect(result.allowed).toBe(false);
			if (!result.allowed) {
				// Should be ~30 seconds remaining
				expect(result.retryAfterMs).toBeGreaterThan(25000);
				expect(result.retryAfterMs).toBeLessThanOrEqual(30000);
			}
		});
	});

	describe('window expiration', () => {
		it('allows request after window expires', () => {
			const config = { maxRequests: 1, windowMs: 60000 };

			checkRateLimit('user-8', config);

			// Advance time past the window
			vi.advanceTimersByTime(61000);

			const result = checkRateLimit('user-8', config);

			expect(result.allowed).toBe(true);
		});

		it('uses sliding window (oldest request expires first)', () => {
			const config = { maxRequests: 2, windowMs: 60000 };

			checkRateLimit('user-9', config); // t=0

			vi.advanceTimersByTime(30000); // t=30s

			checkRateLimit('user-9', config); // t=30s

			// At t=30s, both requests are in window, limit reached
			const blockedResult = checkRateLimit('user-9', config);
			expect(blockedResult.allowed).toBe(false);

			vi.advanceTimersByTime(31000); // t=61s - first request expired

			// Now only the t=30s request is in window
			const allowedResult = checkRateLimit('user-9', config);
			expect(allowedResult.allowed).toBe(true);
		});
	});

	describe('pre-configured limits', () => {
		it('AI limit is 1 request per minute', () => {
			expect(RATE_LIMITS.ai.maxRequests).toBe(1);
			expect(RATE_LIMITS.ai.windowMs).toBe(60000);
		});

		it('read limit is 30 requests per minute', () => {
			expect(RATE_LIMITS.read.maxRequests).toBe(30);
			expect(RATE_LIMITS.read.windowMs).toBe(60000);
		});

		it('write limit is 10 requests per minute', () => {
			expect(RATE_LIMITS.write.maxRequests).toBe(10);
			expect(RATE_LIMITS.write.windowMs).toBe(60000);
		});
	});
});

describe('waitForRateLimit', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('resolves immediately when under limit', async () => {
		const config = { maxRequests: 1, windowMs: 60000 };

		const promise = waitForRateLimit('wait-user-1', config);

		// Should resolve without advancing time
		await vi.runAllTimersAsync();
		await expect(promise).resolves.toBeUndefined();
	});

	it('waits until limit resets', async () => {
		const config = { maxRequests: 1, windowMs: 1000 }; // 1 second window for faster test

		// First request uses up the limit
		await waitForRateLimit('wait-user-2', config);

		// Second request should wait
		const startTime = Date.now();
		const promise = waitForRateLimit('wait-user-2', config);

		// Advance time
		await vi.advanceTimersByTimeAsync(1100);

		await promise;

		// Verify it waited (fake timers)
		expect(vi.getTimerCount()).toBe(0);
	});

	it('records request after waiting', async () => {
		const config = { maxRequests: 1, windowMs: 1000 };

		await waitForRateLimit('wait-user-3', config);

		// After first wait, should have used the limit
		const checkResult = checkRateLimit('wait-user-3', config);
		expect(checkResult.allowed).toBe(false);
	});
});
