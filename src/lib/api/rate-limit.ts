/**
 * Rate Limiting Utility
 *
 * Simple in-memory rate limiter for API endpoints.
 * Uses sliding window algorithm per user.
 *
 * For production scale, replace with Redis-backed solution.
 */

import { json } from '@sveltejs/kit';

// In-memory store: userId -> { timestamps: number[] }
const rateLimitStore = new Map<string, { timestamps: number[] }>();

// Cleanup old entries every 5 minutes
setInterval(() => {
	const now = Date.now();
	const cutoff = now - 120_000; // 2 minutes ago

	for (const [userId, data] of rateLimitStore.entries()) {
		data.timestamps = data.timestamps.filter(t => t > cutoff);
		if (data.timestamps.length === 0) {
			rateLimitStore.delete(userId);
		}
	}
}, 300_000);

export interface RateLimitConfig {
	/** Maximum requests allowed in the window */
	maxRequests: number;
	/** Time window in milliseconds */
	windowMs: number;
}

export type RateLimitResult =
	| { allowed: true }
	| { allowed: false; error: Response; retryAfterMs: number };

/**
 * Wait until rate limit allows the request, then proceed.
 * Silently delays instead of returning an error.
 *
 * @param userId - The authenticated user's ID
 * @param config - Rate limit configuration
 *
 * @example
 * await waitForRateLimit(userId, RATE_LIMITS.ai);
 * // Request proceeds after wait
 */
export async function waitForRateLimit(userId: string, config: RateLimitConfig): Promise<void> {
	const now = Date.now();
	const windowStart = now - config.windowMs;

	// Get or create user's rate limit data
	let userData = rateLimitStore.get(userId);
	if (!userData) {
		userData = { timestamps: [] };
		rateLimitStore.set(userId, userData);
	}

	// Filter to only timestamps within the window
	userData.timestamps = userData.timestamps.filter(t => t > windowStart);

	// If at limit, wait until oldest request expires
	if (userData.timestamps.length >= config.maxRequests) {
		const oldestInWindow = Math.min(...userData.timestamps);
		const waitMs = oldestInWindow + config.windowMs - now + 100; // +100ms buffer

		if (waitMs > 0) {
			await new Promise(resolve => setTimeout(resolve, waitMs));
			// Re-filter after waiting
			userData.timestamps = userData.timestamps.filter(t => t > Date.now() - config.windowMs);
		}
	}

	// Record this request
	userData.timestamps.push(Date.now());
}

/**
 * Check if a request is allowed under rate limits (returns error response).
 * Use waitForRateLimit() instead if you want silent waiting.
 *
 * @param userId - The authenticated user's ID
 * @param config - Rate limit configuration
 * @returns RateLimitResult indicating if request is allowed
 */
export function checkRateLimit(userId: string, config: RateLimitConfig): RateLimitResult {
	const now = Date.now();
	const windowStart = now - config.windowMs;

	// Get or create user's rate limit data
	let userData = rateLimitStore.get(userId);
	if (!userData) {
		userData = { timestamps: [] };
		rateLimitStore.set(userId, userData);
	}

	// Filter to only timestamps within the window
	userData.timestamps = userData.timestamps.filter(t => t > windowStart);

	// Check if over limit
	if (userData.timestamps.length >= config.maxRequests) {
		// Calculate when the oldest request will expire
		const oldestInWindow = Math.min(...userData.timestamps);
		const retryAfterMs = oldestInWindow + config.windowMs - now;
		const retryAfterSec = Math.ceil(retryAfterMs / 1000);

		return {
			allowed: false,
			retryAfterMs,
			error: json(
				{
					error: {
						message: `Rate limit exceeded. Please wait ${retryAfterSec} seconds.`,
						code: 'RATE_LIMITED',
						retryAfter: retryAfterSec
					}
				},
				{
					status: 429,
					headers: {
						'Retry-After': retryAfterSec.toString()
					}
				}
			)
		};
	}

	// Allow request and record timestamp
	userData.timestamps.push(now);

	return { allowed: true };
}

/**
 * Pre-configured rate limits for different endpoint types
 */
export const RATE_LIMITS = {
	/** AI chat endpoints: 1 request per minute */
	ai: { maxRequests: 1, windowMs: 60_000 },

	/** Read-only endpoints: 30 requests per minute */
	read: { maxRequests: 30, windowMs: 60_000 },

	/** Write endpoints (non-AI): 10 requests per minute */
	write: { maxRequests: 10, windowMs: 60_000 }
} as const;
