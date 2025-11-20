/**
 * Retry Logic for External API Calls
 *
 * Provides exponential backoff retry mechanism for transient failures
 * (rate limits, temporary service unavailability).
 *
 * Usage:
 * ```typescript
 * import { callWithRetry } from '$lib/api-retry';
 *
 * const result = await callWithRetry(
 *   () => fetch('https://api.example.com/endpoint'),
 *   { maxRetries: 3, initialDelay: 1000 }
 * );
 * ```
 */

import { RETRY_CONFIG } from '$lib/config/processing';

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;

  /** Initial delay in milliseconds before first retry (default: 1000ms) */
  initialDelay?: number;

  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;

  /** HTTP status codes that should trigger retry (default: [429, 503]) */
  retryableStatuses?: number[];

  /** Custom logger function (default: console.log) */
  logger?: (message: string) => void;
}

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly response?: Response
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: RETRY_CONFIG.maxRetries,
  initialDelay: RETRY_CONFIG.initialDelay,
  backoffMultiplier: RETRY_CONFIG.backoffMultiplier,
  retryableStatuses: [...RETRY_CONFIG.retryableStatuses],
  logger: (message: string) => console.log(`[api-retry] ${message}`)
};

/**
 * Execute an async function with exponential backoff retry logic.
 *
 * @param apiCall - Async function that returns a Promise
 * @param options - Retry configuration options
 * @returns Promise resolving to the result of apiCall
 * @throws Error if all retries are exhausted or non-retryable error occurs
 *
 * @example
 * ```typescript
 * // Retry Fireworks AI call on 429 errors
 * const response = await callWithRetry(
 *   async () => {
 *     const res = await fetch('https://api.fireworks.ai/inference/v1/completions', {
 *       method: 'POST',
 *       headers: { 'Authorization': `Bearer ${apiKey}` },
 *       body: JSON.stringify(payload)
 *     });
 *     if (!res.ok) throw new RetryableError('API error', res.status, res);
 *     return res.json();
 *   },
 *   { maxRetries: 3, initialDelay: 1000 }
 * );
 * ```
 */
export async function callWithRetry<T>(
  apiCall: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await apiCall();

    } catch (error: any) {
      // Determine if error is retryable
      const status = error?.status || error?.response?.status;
      const isRetryable = status && opts.retryableStatuses.includes(status);
      const isLastAttempt = attempt === opts.maxRetries;

      // If not retryable or last attempt, throw immediately
      if (!isRetryable || isLastAttempt) {
        if (isLastAttempt && isRetryable) {
          opts.logger(
            `Attempt ${attempt + 1}/${opts.maxRetries + 1} failed. All retries exhausted.`
          );
        }
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt);

      opts.logger(
        `Attempt ${attempt + 1}/${opts.maxRetries + 1} failed with status ${status}. ` +
        `Retrying in ${delay}ms... (${opts.maxRetries - attempt} retries remaining)`
      );

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // TypeScript needs this, but it's unreachable
  throw new Error('Retry logic error: exceeded max retries without throwing');
}

/**
 * Specialized retry wrapper for fetch() calls.
 * Automatically checks response.ok and throws RetryableError for non-OK responses.
 *
 * @param input - fetch() URL or Request
 * @param init - fetch() options
 * @param options - Retry configuration
 * @returns Promise resolving to Response object
 *
 * @example
 * ```typescript
 * const response = await fetchWithRetry('https://api.fireworks.ai/endpoint', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${key}` },
 *   body: JSON.stringify(data)
 * });
 * const json = await response.json();
 * ```
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  return callWithRetry(
    async () => {
      const response = await fetch(input, init);

      if (!response.ok) {
        throw new RetryableError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response
        );
      }

      return response;
    },
    options
  );
}
