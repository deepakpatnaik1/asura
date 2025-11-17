/**
 * Unit Tests for vectorization.ts
 *
 * Tests embedding generation with mocked Voyage AI API.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockEmbedding, createMockEmbeddingResponse } from '../../mocks/voyage.mock';

// Mock the VoyageAIClient using vi.hoisted() BEFORE imports
const mockVoyageClient = vi.hoisted(() => ({
	embed: vi.fn()
}));

const MockVoyageAIClient = vi.hoisted(() => {
	return class {
		embed = mockVoyageClient.embed;
	};
});

vi.mock('voyageai', () => ({
	VoyageAIClient: MockVoyageAIClient
}));

// NOW import the module that uses VoyageAIClient
import { generateEmbedding, VectorizationError } from '$lib/vectorization';

describe('vectorization', () => {
	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('generateEmbedding', () => {
		it('should generate 1024-dimensional embedding for valid text', async () => {
			const mockEmbedding = createMockEmbedding();
			mockVoyageClient.embed.mockResolvedValue(createMockEmbeddingResponse(mockEmbedding));

			const text = 'This is a test document about machine learning.';
			const embedding = await generateEmbedding(text);

			expect(embedding).toHaveLength(1024);
			expect(embedding.every((val: number) => typeof val === 'number')).toBe(true);
			expect(mockVoyageClient.embed).toHaveBeenCalledWith({
				input: text,
				model: 'voyage-3',
				inputType: 'document'
			});
		});

		it('should call Voyage AI with correct parameters', async () => {
			mockVoyageClient.embed.mockResolvedValue(createMockEmbeddingResponse());

			const text = 'Sample text for embedding';
			await generateEmbedding(text);

			expect(mockVoyageClient.embed).toHaveBeenCalledTimes(1);
			expect(mockVoyageClient.embed).toHaveBeenCalledWith({
				input: text,
				model: 'voyage-3',
				inputType: 'document'
			});
		});

		it('should handle long text (within limits)', async () => {
			mockVoyageClient.embed.mockResolvedValue(createMockEmbeddingResponse());

			// Create text ~8000 tokens (32000 chars)
			const longText = 'word '.repeat(8000);
			const embedding = await generateEmbedding(longText);

			expect(embedding).toHaveLength(1024);
		});

		it('should return different embeddings for different text', async () => {
			const embedding1 = createMockEmbedding();
			const embedding2 = embedding1.map((val) => val * 1.1); // Different values

			mockVoyageClient.embed
				.mockResolvedValueOnce(createMockEmbeddingResponse(embedding1))
				.mockResolvedValueOnce(createMockEmbeddingResponse(embedding2));

			const result1 = await generateEmbedding('Text A');
			const result2 = await generateEmbedding('Text B');

			expect(result1).not.toEqual(result2);
		});
	});

	describe('error handling', () => {
		it('should throw EMPTY_TEXT for empty string', async () => {
			await expect(generateEmbedding('')).rejects.toThrow(VectorizationError);

			try {
				await generateEmbedding('');
			} catch (error) {
				expect(error).toBeInstanceOf(VectorizationError);
				expect((error as VectorizationError).code).toBe('EMPTY_TEXT');
				expect((error as VectorizationError).message).toContain('empty text');
			}
		});

		it('should throw EMPTY_TEXT for whitespace-only string', async () => {
			await expect(generateEmbedding('   \n\t  ')).rejects.toThrow(VectorizationError);

			try {
				await generateEmbedding('   \n\t  ');
			} catch (error) {
				expect((error as VectorizationError).code).toBe('EMPTY_TEXT');
			}
		});

		it('should throw TEXT_TOO_LONG for very long text', async () => {
			// Create text > 32000 tokens (128000 chars)
			const veryLongText = 'word '.repeat(40000); // ~160000 chars

			await expect(generateEmbedding(veryLongText)).rejects.toThrow(VectorizationError);

			try {
				await generateEmbedding(veryLongText);
			} catch (error) {
				expect(error).toBeInstanceOf(VectorizationError);
				expect((error as VectorizationError).code).toBe('TEXT_TOO_LONG');
				expect((error as VectorizationError).message).toContain('too long');
				expect((error as VectorizationError).details).toHaveProperty('estimatedTokens');
				expect((error as VectorizationError).details).toHaveProperty('maxTokens');
			}
		});

		it('should throw API_ERROR when API call fails (API key issue)', async () => {
			// Note: VOYAGE_API_KEY is captured at module load time as a const,
			// so deleting process.env.VOYAGE_API_KEY doesn't affect the already-initialized client.
			// This test verifies that API errors are properly wrapped.

			// Mock the embed function to simulate an auth error
			mockVoyageClient.embed.mockRejectedValue(new Error('Unauthorized: Invalid API key'));

			await expect(generateEmbedding('test')).rejects.toThrow(VectorizationError);

			try {
				await generateEmbedding('test');
			} catch (error) {
				expect((error as VectorizationError).code).toBe('API_ERROR');
				expect((error as VectorizationError).message).toContain('API error');
			}
		});

		it('should throw API_RATE_LIMIT for rate limit errors', async () => {
			mockVoyageClient.embed.mockRejectedValue(new Error('rate limit exceeded'));

			await expect(generateEmbedding('test')).rejects.toThrow(VectorizationError);

			try {
				await generateEmbedding('test');
			} catch (error) {
				expect((error as VectorizationError).code).toBe('API_RATE_LIMIT');
				expect((error as VectorizationError).message).toContain('rate limit');
			}
		});

		it('should throw API_ERROR for generic API failures', async () => {
			mockVoyageClient.embed.mockRejectedValue(new Error('Network error'));

			await expect(generateEmbedding('test')).rejects.toThrow(VectorizationError);

			try {
				await generateEmbedding('test');
			} catch (error) {
				expect((error as VectorizationError).code).toBe('API_ERROR');
				expect((error as VectorizationError).message).toContain('API error');
			}
		});

		it('should throw INVALID_EMBEDDING_DIMENSIONS for wrong dimensions', async () => {
			// Mock response with wrong number of dimensions
			const wrongEmbedding = Array.from({ length: 512 }, () => 0.5);
			mockVoyageClient.embed.mockResolvedValue(createMockEmbeddingResponse(wrongEmbedding));

			await expect(generateEmbedding('test')).rejects.toThrow(VectorizationError);

			try {
				await generateEmbedding('test');
			} catch (error) {
				expect((error as VectorizationError).code).toBe('INVALID_EMBEDDING_DIMENSIONS');
				expect((error as VectorizationError).message).toContain('1024-dimensional');
				expect((error as VectorizationError).details).toHaveProperty('expectedDimensions', 1024);
				expect((error as VectorizationError).details).toHaveProperty('actualDimensions', 512);
			}
		});

		it('should throw INVALID_EMBEDDING_DIMENSIONS for non-numeric values', async () => {
			// Mock response with non-numeric values
			const invalidEmbedding = Array.from({ length: 1024 }, (_, i) =>
				i < 512 ? 0.5 : 'invalid'
			) as any;
			mockVoyageClient.embed.mockResolvedValue(createMockEmbeddingResponse(invalidEmbedding));

			await expect(generateEmbedding('test')).rejects.toThrow(VectorizationError);

			try {
				await generateEmbedding('test');
			} catch (error) {
				expect((error as VectorizationError).code).toBe('INVALID_EMBEDDING_DIMENSIONS');
				expect((error as VectorizationError).message).toContain('non-numeric');
			}
		});

		it('should throw INVALID_EMBEDDING_DIMENSIONS for null embedding', async () => {
			mockVoyageClient.embed.mockResolvedValue({
				data: [{ embedding: null }]
			});

			await expect(generateEmbedding('test')).rejects.toThrow(VectorizationError);

			try {
				await generateEmbedding('test');
			} catch (error) {
				expect((error as VectorizationError).code).toBe('INVALID_EMBEDDING_DIMENSIONS');
			}
		});

		it('should throw INVALID_EMBEDDING_DIMENSIONS for empty array', async () => {
			mockVoyageClient.embed.mockResolvedValue(createMockEmbeddingResponse([]));

			await expect(generateEmbedding('test')).rejects.toThrow(VectorizationError);

			try {
				await generateEmbedding('test');
			} catch (error) {
				expect((error as VectorizationError).code).toBe('INVALID_EMBEDDING_DIMENSIONS');
			}
		});
	});

	describe('edge cases', () => {
		it('should handle text with special characters', async () => {
			mockVoyageClient.embed.mockResolvedValue(createMockEmbeddingResponse());

			const text = 'Special chars: @#$%^&*()_+-={}[]|\\:";\'<>?,./`~';
			const embedding = await generateEmbedding(text);

			expect(embedding).toHaveLength(1024);
		});

		it('should handle text with Unicode', async () => {
			mockVoyageClient.embed.mockResolvedValue(createMockEmbeddingResponse());

			const text = 'Unicode: 你好 مرحبا שלום こんにちは 🌍🚀';
			const embedding = await generateEmbedding(text);

			expect(embedding).toHaveLength(1024);
		});

		it('should handle text with newlines and tabs', async () => {
			mockVoyageClient.embed.mockResolvedValue(createMockEmbeddingResponse());

			const text = 'Line 1\nLine 2\tTabbed\n\nDouble newline';
			const embedding = await generateEmbedding(text);

			expect(embedding).toHaveLength(1024);
		});

		it('should handle single character', async () => {
			mockVoyageClient.embed.mockResolvedValue(createMockEmbeddingResponse());

			const embedding = await generateEmbedding('a');

			expect(embedding).toHaveLength(1024);
		});

		it('should handle text at token limit boundary (~32000 tokens)', async () => {
			mockVoyageClient.embed.mockResolvedValue(createMockEmbeddingResponse());

			// Create text close to limit: ~31000 tokens (~124000 chars)
			// Each "word " is 5 chars, so 31000 * 5 = 155000 chars = ~38750 tokens (exceeds limit)
			// Use 25000 * 5 = 125000 chars = ~31250 tokens (within limit)
			const boundaryText = 'word '.repeat(25000);
			const embedding = await generateEmbedding(boundaryText);

			expect(embedding).toHaveLength(1024);
		});

		it('should validate embedding values are in valid range', async () => {
			mockVoyageClient.embed.mockResolvedValue(createMockEmbeddingResponse());

			const embedding = await generateEmbedding('test');

			// Embeddings should be floats, typically in range [-1, 1] or so
			expect(embedding.every((val) => Number.isFinite(val))).toBe(true);
			expect(embedding.every((val) => !Number.isNaN(val))).toBe(true);
		});
	});

	describe('VectorizationError class', () => {
		it('should create error with all properties', () => {
			const error = new VectorizationError('Test message', 'API_ERROR', { key: 'value' });

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(VectorizationError);
			expect(error.name).toBe('VectorizationError');
			expect(error.message).toBe('Test message');
			expect(error.code).toBe('API_ERROR');
			expect(error.details).toEqual({ key: 'value' });
		});

		it('should create error without details', () => {
			const error = new VectorizationError('Test message', 'EMPTY_TEXT');

			expect(error.message).toBe('Test message');
			expect(error.code).toBe('EMPTY_TEXT');
			expect(error.details).toBeUndefined();
		});

		it('should have stack trace', () => {
			const error = new VectorizationError('Test', 'API_ERROR');

			expect(error.stack).toBeDefined();
			expect(error.stack).toContain('VectorizationError');
		});
	});
});
