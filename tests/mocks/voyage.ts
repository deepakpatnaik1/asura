/**
 * Voyage AI Client Mock
 *
 * Provides mock implementations for Voyage embedding operations.
 */

import { vi } from 'vitest';

// Mock embedding response
export interface MockEmbeddingResponse {
	data: Array<{
		embedding: number[];
		index: number;
	}>;
	model: string;
	usage: {
		total_tokens: number;
	};
}

// Generate a mock embedding vector (1024 dimensions for voyage-3)
export function createMockEmbedding(dimensions: number = 1024): number[] {
	return Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
}

export function createMockEmbeddingResponse(
	inputs: string | string[],
	dimensions: number = 1024
): MockEmbeddingResponse {
	const inputArray = Array.isArray(inputs) ? inputs : [inputs];

	return {
		data: inputArray.map((_, index) => ({
			embedding: createMockEmbedding(dimensions),
			index
		})),
		model: 'voyage-3',
		usage: {
			total_tokens: inputArray.reduce((acc, text) => acc + text.split(' ').length, 0)
		}
	};
}

// Mock Voyage client
export function createMockVoyageClient() {
	return {
		embed: vi.fn().mockImplementation(({ input }) => {
			return Promise.resolve(createMockEmbeddingResponse(input));
		}),
		rerank: vi.fn().mockResolvedValue({
			data: [],
			model: 'rerank-2',
			usage: { total_tokens: 0 }
		})
	};
}

// Mock the voyageai module
export function mockVoyageModule() {
	return vi.mock('voyageai', () => ({
		VoyageAIClient: vi.fn().mockImplementation(() => createMockVoyageClient())
	}));
}
