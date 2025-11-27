/**
 * Configuration for fetch retry behavior
 */
interface RetryConfig {
	/** Maximum number of retry attempts (default: 3) */
	maxRetries?: number;
	/** Base delay in ms for exponential backoff (default: 1000) */
	baseDelayMs?: number;
	/** Maximum delay in ms between retries (default: 10000) */
	maxDelayMs?: number;
	/** HTTP status codes to retry on (default: 502, 503, 504) */
	retryOnStatus?: number[];
	/** Request timeout in ms (default: 30000) */
	timeoutMs?: number;
}

/**
 * Result of a fetch with retry attempt
 */
interface FetchResult {
	response: Response;
	attempts: number;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
	maxRetries: 3,
	baseDelayMs: 1000,
	maxDelayMs: 10000,
	retryOnStatus: [502, 503, 504],
	timeoutMs: 30000
};

/**
 * Fetch with automatic retry and exponential backoff for transient failures.
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @param config - Retry configuration
 * @returns The successful response
 * @throws Error if all retries exhausted or non-retryable error
 *
 * @example
 * ```typescript
 * const response = await fetchWithRetry('/api/chat', {
 *   method: 'POST',
 *   body: JSON.stringify({ message: 'hello' })
 * });
 * ```
 */
export async function fetchWithRetry(
	url: string,
	options: RequestInit = {},
	config: RetryConfig = {}
): Promise<FetchResult> {
	const cfg = { ...DEFAULT_CONFIG, ...config };

	for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);

		// Merge abort signals if one was provided
		const originalSignal = options.signal;
		if (originalSignal) {
			originalSignal.addEventListener('abort', () => controller.abort());
		}

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			// Success or client error (4xx) - don't retry
			if (response.ok || (response.status >= 400 && response.status < 500)) {
				return { response, attempts: attempt };
			}

			// Check if we should retry this status code
			if (!cfg.retryOnStatus.includes(response.status)) {
				return { response, attempts: attempt };
			}

			// Last attempt - return the error response
			if (attempt === cfg.maxRetries) {
				return { response, attempts: attempt };
			}

			// Calculate delay with exponential backoff and jitter
			const delay = Math.min(
				cfg.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
				cfg.maxDelayMs
			);

			await sleep(delay);
		} catch (error) {
			clearTimeout(timeoutId);

			// If user aborted, propagate immediately
			if (originalSignal?.aborted) {
				throw error;
			}

			// Timeout or network error
			if (attempt === cfg.maxRetries) {
				throw error;
			}

			// Calculate delay with exponential backoff
			const delay = Math.min(
				cfg.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
				cfg.maxDelayMs
			);

			await sleep(delay);
		}
	}

	// Should never reach here, but TypeScript needs this
	throw new Error('Max retries exceeded');
}

/**
 * Fetch with timeout only (no retry).
 * Use this for streaming requests where retry doesn't make sense.
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns The response
 */
export async function fetchWithTimeout(
	url: string,
	options: RequestInit = {},
	timeoutMs: number = 30000
): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	// Merge abort signals if one was provided
	const originalSignal = options.signal;
	if (originalSignal) {
		originalSignal.addEventListener('abort', () => controller.abort());
	}

	try {
		const response = await fetch(url, {
			...options,
			signal: controller.signal
		});
		return response;
	} finally {
		clearTimeout(timeoutId);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
