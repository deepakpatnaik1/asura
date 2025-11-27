/**
 * Rate Limiting Utility
 *
 * Sliding window rate limiter with Redis support for production scale.
 * Falls back to in-memory when Redis is unavailable (dev/single-instance).
 *
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 * environment variables are configured.
 */

import { Redis } from '@upstash/redis';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
	/** Maximum requests allowed in the window */
	maxRequests: number;
	/** Time window in milliseconds */
	windowMs: number;
}

export type RateLimitResult =
	| { allowed: true }
	| { allowed: false; error: Response; retryAfterMs: number };

// ============================================================================
// Redis Client (lazy initialization)
// ============================================================================

let redis: Redis | null = null;
let redisChecked = false;

function getRedis(): Redis | null {
	if (redisChecked) return redis;

	const url = env.UPSTASH_REDIS_REST_URL;
	const token = env.UPSTASH_REDIS_REST_TOKEN;

	if (url && token) {
		redis = new Redis({ url, token });
	}

	redisChecked = true;
	return redis;
}

// ============================================================================
// In-Memory Fallback Store
// ============================================================================

const memoryStore = new Map<string, { timestamps: number[] }>();

// Cleanup old entries every 5 minutes
setInterval(() => {
	const now = Date.now();
	const cutoff = now - 120_000; // 2 minutes ago

	for (const [userId, data] of memoryStore.entries()) {
		data.timestamps = data.timestamps.filter((t) => t > cutoff);
		if (data.timestamps.length === 0) {
			memoryStore.delete(userId);
		}
	}
}, 300_000);

// ============================================================================
// Public API
// ============================================================================

/**
 * Wait until rate limit allows the request, then proceed.
 * Silently delays instead of returning an error.
 *
 * Uses Redis when available, falls back to in-memory.
 *
 * @param userId - The authenticated user's ID
 * @param config - Rate limit configuration
 * @param endpoint - Optional endpoint identifier for Redis namespacing
 *
 * @example
 * await waitForRateLimit(userId, RATE_LIMITS.ai);
 * // Request proceeds after wait
 */
export async function waitForRateLimit(
	userId: string,
	config: RateLimitConfig,
	endpoint = 'default'
): Promise<void> {
	const redisClient = getRedis();

	if (redisClient) {
		await waitForRateLimitRedis(redisClient, userId, config, endpoint);
	} else {
		await waitForRateLimitMemory(userId, config);
	}
}

/**
 * Check if a request is allowed under rate limits (returns error response).
 * Use waitForRateLimit() instead if you want silent waiting.
 *
 * Uses Redis when available, falls back to in-memory.
 *
 * @param userId - The authenticated user's ID
 * @param config - Rate limit configuration
 * @param endpoint - Optional endpoint identifier for Redis namespacing
 * @returns RateLimitResult indicating if request is allowed
 */
export async function checkRateLimit(
	userId: string,
	config: RateLimitConfig,
	endpoint = 'default'
): Promise<RateLimitResult> {
	const redisClient = getRedis();

	if (redisClient) {
		return checkRateLimitRedis(redisClient, userId, config, endpoint);
	}

	return checkRateLimitMemory(userId, config);
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

// ============================================================================
// Redis Implementation
// ============================================================================

async function checkRateLimitRedis(
	client: Redis,
	userId: string,
	config: RateLimitConfig,
	endpoint: string
): Promise<RateLimitResult> {
	const key = `ratelimit:${endpoint}:${userId}`;
	const now = Date.now();
	const windowStart = now - config.windowMs;

	try {
		// Use Redis pipeline for atomicity
		const pipeline = client.pipeline();

		// Remove expired entries
		pipeline.zremrangebyscore(key, 0, windowStart);

		// Count entries in window
		pipeline.zcard(key);

		// Execute pipeline
		const results = await pipeline.exec();
		const count = results[1] as number;

		if (count >= config.maxRequests) {
			// Get oldest entry to calculate retry time
			const oldest = (await client.zrange(key, 0, 0, { withScores: true })) as Array<{
				score: number;
				member: string;
			}>;
			const oldestTime = oldest[0]?.score || now;
			const retryAfterMs = Math.max(0, oldestTime + config.windowMs - now);

			return createRateLimitError(retryAfterMs);
		}

		// Add this request and set TTL
		await client.zadd(key, { score: now, member: `${now}-${Math.random()}` });
		await client.expire(key, Math.ceil(config.windowMs / 1000) + 60); // TTL = window + buffer

		return { allowed: true };
	} catch (error) {
		// On Redis error, fall back to allowing the request
		// (prefer availability over strict rate limiting)
		console.error('[RateLimit] Redis error, allowing request:', error);
		return { allowed: true };
	}
}

async function waitForRateLimitRedis(
	client: Redis,
	userId: string,
	config: RateLimitConfig,
	endpoint: string
): Promise<void> {
	const result = await checkRateLimitRedis(client, userId, config, endpoint);

	if (!result.allowed) {
		await new Promise((resolve) => setTimeout(resolve, result.retryAfterMs + 100));
		// Re-check after waiting (recursive, but will succeed after wait)
		await waitForRateLimitRedis(client, userId, config, endpoint);
	}
}

// ============================================================================
// In-Memory Implementation
// ============================================================================

function checkRateLimitMemory(userId: string, config: RateLimitConfig): RateLimitResult {
	const now = Date.now();
	const windowStart = now - config.windowMs;

	// Get or create user's rate limit data
	let userData = memoryStore.get(userId);
	if (!userData) {
		userData = { timestamps: [] };
		memoryStore.set(userId, userData);
	}

	// Filter to only timestamps within the window
	userData.timestamps = userData.timestamps.filter((t) => t > windowStart);

	// Check if over limit
	if (userData.timestamps.length >= config.maxRequests) {
		const oldestInWindow = Math.min(...userData.timestamps);
		const retryAfterMs = oldestInWindow + config.windowMs - now;

		return createRateLimitError(retryAfterMs);
	}

	// Allow request and record timestamp
	userData.timestamps.push(now);

	return { allowed: true };
}

async function waitForRateLimitMemory(userId: string, config: RateLimitConfig): Promise<void> {
	const now = Date.now();
	const windowStart = now - config.windowMs;

	// Get or create user's rate limit data
	let userData = memoryStore.get(userId);
	if (!userData) {
		userData = { timestamps: [] };
		memoryStore.set(userId, userData);
	}

	// Filter to only timestamps within the window
	userData.timestamps = userData.timestamps.filter((t) => t > windowStart);

	// If at limit, wait until oldest request expires
	if (userData.timestamps.length >= config.maxRequests) {
		const oldestInWindow = Math.min(...userData.timestamps);
		const waitMs = oldestInWindow + config.windowMs - now + 100; // +100ms buffer

		if (waitMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, waitMs));
			// Re-filter after waiting
			userData.timestamps = userData.timestamps.filter((t) => t > Date.now() - config.windowMs);
		}
	}

	// Record this request
	userData.timestamps.push(Date.now());
}

// ============================================================================
// Helpers
// ============================================================================

function createRateLimitError(retryAfterMs: number): RateLimitResult {
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

// ============================================================================
// Testing Utilities
// ============================================================================

/**
 * Reset the in-memory rate limit store.
 * Only use in tests.
 */
export function _resetMemoryStore(): void {
	memoryStore.clear();
}

/**
 * Check if Redis is available.
 * Only use in tests.
 */
export function _isRedisAvailable(): boolean {
	return getRedis() !== null;
}
