/**
 * Retry Utility for Background Jobs
 *
 * Provides a simple retry mechanism for database operations
 * that may fail due to transient errors.
 */

import { createLogger } from '$lib/api/logger';

/** Default retry delays: 1 minute, 5 minutes, 10 minutes */
export const RETRY_DELAYS = [60_000, 300_000, 600_000];

/**
 * Schedule retries for an async operation.
 * Each retry is scheduled independently at the specified delays.
 *
 * @param fn - Async function to retry
 * @param label - Label for logging
 * @param userId - User ID for logging context
 * @param delays - Array of delays in milliseconds
 */
export function scheduleRetries(
	fn: () => Promise<void>,
	label: string,
	userId: string,
	delays: number[] = RETRY_DELAYS
): void {
	const log = createLogger('Retry', userId);

	for (const delay of delays) {
		setTimeout(async () => {
			try {
				await fn();
				log.info('Retry succeeded', { label, delaySeconds: delay / 1000 });
			} catch (error) {
				log.error('Retry failed', {
					label,
					delaySeconds: delay / 1000,
					error: error instanceof Error ? error.message : 'Unknown'
				});
			}
		}, delay);
	}
}
