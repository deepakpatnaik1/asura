/**
 * Voyage AI Client Mock Factory
 *
 * Provides mock implementations of Voyage AI client for testing.
 * Use these mocks to avoid making real API calls during tests.
 */

import { vi } from 'vitest';

/**
 * Create a mock 1024-dimensional embedding vector
 */
export function createMockEmbedding(): number[] {
	// Create a deterministic 1024-dimensional vector
	// Using Math.sin for variety in values
	return Array.from({ length: 1024 }, (_, i) => Math.sin(i / 100));
}

/**
 * Create a mock Voyage AI client
 */
export function createMockVoyageClient() {
	return {
		embed: vi.fn().mockImplementation(async ({ input }) => {
			// Simulate API response structure
			return {
				data: [
					{
						embedding: createMockEmbedding(),
						index: 0,
						object: 'embedding'
					}
				],
				model: 'voyage-3',
				usage: {
					total_tokens: Math.ceil(input.length / 4)
				}
			};
		})
	};
}

/**
 * Create a mock Voyage AI error
 */
export function createMockVoyageError(message: string, code?: string) {
	const error = new Error(message);
	(error as any).code = code || 'VOYAGE_ERROR';
	return error;
}

/**
 * Create a mock rate limit error
 */
export function createMockRateLimitError() {
	return createMockVoyageError(
		'Rate limit exceeded. Please try again later.',
		'RATE_LIMIT_EXCEEDED'
	);
}

/**
 * Create a mock embedding response with custom embedding
 */
export function createMockEmbeddingResponse(embedding?: number[]) {
	return {
		data: [
			{
				embedding: embedding || createMockEmbedding(),
				index: 0,
				object: 'embedding'
			}
		],
		model: 'voyage-3',
		usage: {
			total_tokens: 100
		}
	};
}
