/**
 * Redis-backed Rate Limiting Utility
 *
 * Production-ready rate limiter using Upstash Redis.
 * Uses sliding window algorithm per user.
 *
 * Falls back to in-memory rate limiting if Redis is unavailable.
 */

import { Redis } from '@upstash/redis';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Initialize Redis client (lazy - only if credentials exist)
let redis: Redis | null = null;

function getRedis(): Redis | null {
	if (redis) return redis;

	const url = env.UPSTASH_REDIS_REST_URL;
	const token = env.UPSTASH_REDIS_REST_TOKEN;

	if (url && token) {
		redis = new Redis({ url, token });
	}

	return redis;
}

// In-memory fallback store (used when Redis unavailable)
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
 * Check rate limit using Redis (with in-memory fallback).
 *
 * @param userId - The authenticated user's ID
 * @param config - Rate limit configuration
 * @param endpoint - Optional endpoint identifier for namespacing
 */
export async function checkRateLimitRedis(
	userId: string,
	config: RateLimitConfig,
	endpoint = 'default'
): Promise<RateLimitResult> {
	const redisClient = getRedis();

	// Use Redis if available
	if (redisClient) {
		return checkRateLimitWithRedis(redisClient, userId, config, endpoint);
	}

	// Fallback to in-memory
	return checkRateLimitInMemory(userId, config);
}

/**
 * Wait until rate limit allows the request (Redis-backed with fallback).
 */
export async function waitForRateLimitRedis(
	userId: string,
	config: RateLimitConfig,
	endpoint = 'default'
): Promise<void> {
	const result = await checkRateLimitRedis(userId, config, endpoint);

	if (!result.allowed) {
		// Wait and retry
		await new Promise((resolve) => setTimeout(resolve, result.retryAfterMs + 100));
	}
}

// ============================================================================
// Redis Implementation
// ============================================================================

async function checkRateLimitWithRedis(
	redis: Redis,
	userId: string,
	config: RateLimitConfig,
	endpoint: string
): Promise<RateLimitResult> {
	const key = `ratelimit:${endpoint}:${userId}`;
	const now = Date.now();
	const windowStart = now - config.windowMs;

	try {
		// Use Redis transaction for atomicity
		const pipeline = redis.pipeline();

		// Remove expired entries
		pipeline.zremrangebyscore(key, 0, windowStart);

		// Count entries in window
		pipeline.zcard(key);

		// Execute pipeline
		const results = await pipeline.exec();
		const count = results[1] as number;

		if (count >= config.maxRequests) {
			// Get oldest entry to calculate retry time
			const oldest = await redis.zrange(key, 0, 0, { withScores: true }) as Array<{ score: number; member: string }>;
			const oldestTime = oldest[0]?.score || now;
			const retryAfterMs = Math.max(0, oldestTime + config.windowMs - now);
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

		// Add this request and set TTL
		await redis.zadd(key, { score: now, member: `${now}-${Math.random()}` });
		await redis.expire(key, Math.ceil(config.windowMs / 1000) + 60); // TTL = window + buffer

		return { allowed: true };
	} catch (error) {
		// On Redis error, fall back to allowing the request
		// (prefer availability over strict rate limiting)
		console.error('[RateLimit] Redis error, allowing request:', error);
		return { allowed: true };
	}
}

// ============================================================================
// In-Memory Fallback
// ============================================================================

function checkRateLimitInMemory(userId: string, config: RateLimitConfig): RateLimitResult {
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
