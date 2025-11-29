/**
 * Query Performance Monitor
 *
 * Wraps Supabase queries to log slow queries for performance monitoring.
 * Configurable threshold - logs warning when exceeded.
 *
 * Usage:
 *   const monitor = createQueryMonitor(log, 100); // 100ms threshold
 *   const result = await monitor.track('fetchMessages', async () => {
 *     return supabase.from('superjournal').select('*').limit(50);
 *   });
 */

import type { Logger } from './logger';

// Default slow query threshold in milliseconds
const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 100;

export interface QueryMonitor {
	/**
	 * Track a database query and log if it exceeds threshold
	 * @param queryName - Descriptive name for the query (e.g., 'fetchMessages', 'insertJournal')
	 * @param queryFn - Async function that executes the query
	 * @returns The result of the query function
	 */
	track: <T>(queryName: string, queryFn: () => Promise<T>) => Promise<T>;

	/**
	 * Get timing stats for all tracked queries in this session
	 */
	getStats: () => QueryStats;
}

interface QueryTiming {
	name: string;
	durationMs: number;
	timestamp: string;
	slow: boolean;
}

interface QueryStats {
	totalQueries: number;
	slowQueries: number;
	averageMs: number;
	maxMs: number;
	queries: QueryTiming[];
}

/**
 * Create a query monitor instance
 *
 * @param logger - Logger instance for output
 * @param thresholdMs - Threshold in ms to consider a query "slow" (default: 100ms)
 */
export function createQueryMonitor(logger: Logger, thresholdMs: number = DEFAULT_SLOW_QUERY_THRESHOLD_MS): QueryMonitor {
	const timings: QueryTiming[] = [];

	return {
		async track<T>(queryName: string, queryFn: () => Promise<T>): Promise<T> {
			const start = performance.now();

			try {
				const result = await queryFn();
				const durationMs = Math.round(performance.now() - start);
				const slow = durationMs > thresholdMs;

				const timing: QueryTiming = {
					name: queryName,
					durationMs,
					timestamp: new Date().toISOString(),
					slow
				};
				timings.push(timing);

				if (slow) {
					logger.warn('Slow query detected', {
						query: queryName,
						durationMs,
						thresholdMs
					});
				} else {
					logger.debug('Query completed', {
						query: queryName,
						durationMs
					});
				}

				return result;
			} catch (error) {
				const durationMs = Math.round(performance.now() - start);
				logger.error('Query failed', {
					query: queryName,
					durationMs,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
				throw error;
			}
		},

		getStats(): QueryStats {
			if (timings.length === 0) {
				return {
					totalQueries: 0,
					slowQueries: 0,
					averageMs: 0,
					maxMs: 0,
					queries: []
				};
			}

			const totalMs = timings.reduce((sum, t) => sum + t.durationMs, 0);
			const maxMs = Math.max(...timings.map(t => t.durationMs));
			const slowCount = timings.filter(t => t.slow).length;

			return {
				totalQueries: timings.length,
				slowQueries: slowCount,
				averageMs: Math.round(totalMs / timings.length),
				maxMs,
				queries: timings
			};
		}
	};
}

/**
 * Simple one-off query timing (for use without full monitor)
 * Returns duration in milliseconds
 */
export async function timeQuery<T>(queryFn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
	const start = performance.now();
	const result = await queryFn();
	const durationMs = Math.round(performance.now() - start);
	return { result, durationMs };
}
