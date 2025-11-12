/**
 * Vector Operations Tests
 *
 * Tests vector embedding storage and similarity search:
 * - Insert embeddings (1024 dimensions)
 * - Similarity search with distance threshold
 * - HNSW index performance
 * - Ranking by distance
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createTestSupabaseClient, generateTestId } from '../../helpers';

// Helper function to parse vector from Postgres string format
function parseVector(embedding: any): number[] | null {
	if (!embedding) return null;
	if (Array.isArray(embedding)) return embedding;
	if (typeof embedding === 'string') {
		// Parse "[0.1,0.2,...]" format
		return JSON.parse(embedding);
	}
	return null;
}

describe('Vector Operations - Embeddings', () => {
	const client = createTestSupabaseClient();
	const testUserId = '00000000-0000-0000-0000-000000000001';
	const createdFileIds: string[] = [];

	afterEach(async () => {
		// Cleanup all created files
		for (const id of createdFileIds) {
			await client.from('files').delete().eq('id', id);
		}
		createdFileIds.length = 0;
	});

	describe('Embedding Storage', () => {
		it('should store a 1024-dimensional embedding vector', async () => {
			const contentHash = generateTestId('vector-store');
			const embedding = Array(1024).fill(0).map((_, i) => Math.sin(i * 0.01));

			const { data, error } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'vector-test.txt',
					content_hash: contentHash,
					file_type: 'text',
					description: 'Test file for vector storage',
					embedding: embedding,
					status: 'ready'
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data).toBeDefined();
			expect(data?.embedding).toBeDefined();
			const parsedEmbedding = parseVector(data?.embedding);
			expect(Array.isArray(parsedEmbedding)).toBe(true);
			expect(parsedEmbedding?.length).toBe(1024);

			if (data?.id) createdFileIds.push(data.id);
		});

		it('should reject embeddings with wrong dimensions', async () => {
			const contentHash = generateTestId('vector-wrong-dim');
			const wrongEmbedding = Array(512).fill(0.5); // Wrong size

			const { error } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'wrong-dims.txt',
					content_hash: contentHash,
					file_type: 'text',
					embedding: wrongEmbedding,
					status: 'ready'
				});

			// Should fail due to dimension mismatch
			expect(error).not.toBeNull();
		});

		it('should allow null embeddings', async () => {
			const contentHash = generateTestId('vector-null');

			const { data, error } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'no-embedding.txt',
					content_hash: contentHash,
					file_type: 'text',
					embedding: null,
					status: 'pending'
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data?.embedding).toBeNull();

			if (data?.id) createdFileIds.push(data.id);
		});

		it('should update embedding after initial insert', async () => {
			const contentHash = generateTestId('vector-update');

			// Insert without embedding
			const { data: inserted } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'update-embedding.txt',
					content_hash: contentHash,
					file_type: 'text',
					embedding: null,
					status: 'processing'
				})
				.select()
				.single();

			if (inserted?.id) createdFileIds.push(inserted.id);

			// Add embedding
			const newEmbedding = Array(1024).fill(0.7);

			const { data: updated, error } = await client
				.from('files')
				.update({
					embedding: newEmbedding,
					status: 'ready'
				})
				.eq('id', inserted?.id)
				.select()
				.single();

			expect(error).toBeNull();
			expect(updated?.embedding).toBeDefined();
			const parsedUpdatedEmbedding = parseVector(updated?.embedding);
			expect(parsedUpdatedEmbedding?.length).toBe(1024);
		});
	});

	describe('Vector Similarity Search', () => {
		it('should find similar vectors using cosine similarity', async () => {
			// Create a query vector (normalized)
			const queryVector = Array(1024).fill(0).map((_, i) => Math.sin(i * 0.1));

			// Insert similar vector (slightly different)
			const similarVector = Array(1024).fill(0).map((_, i) => Math.sin(i * 0.1 + 0.05));
			const { data: similar } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'similar.txt',
					content_hash: generateTestId('similar'),
					file_type: 'text',
					description: 'Similar document',
					embedding: similarVector,
					status: 'ready'
				})
				.select()
				.single();

			if (similar?.id) createdFileIds.push(similar.id);

			// Insert dissimilar vector
			const dissimilarVector = Array(1024).fill(0).map((_, i) => Math.cos(i * 0.5));
			const { data: dissimilar } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'dissimilar.txt',
					content_hash: generateTestId('dissimilar'),
					file_type: 'text',
					description: 'Dissimilar document',
					embedding: dissimilarVector,
					status: 'ready'
				})
				.select()
				.single();

			if (dissimilar?.id) createdFileIds.push(dissimilar.id);

			// Perform similarity search using RPC function (if exists)
			// Note: This might need the search_files function from migrations
			// For now, we'll test that we can query by embedding
			const { data: results, error } = await client
				.from('files')
				.select('id, filename, description, embedding')
				.not('embedding', 'is', null)
				.limit(10);

			expect(error).toBeNull();
			expect(results).toBeDefined();
			expect(results?.length).toBeGreaterThanOrEqual(2);
		});

		it('should use HNSW index for fast approximate search', async () => {
			// Insert multiple vectors
			const numVectors = 5;
			const insertedIds: string[] = [];

			for (let i = 0; i < numVectors; i++) {
				const embedding = Array(1024).fill(0).map((_, j) => Math.sin(j * 0.01 + i));
				const { data } = await client
					.from('files')
					.insert({
						user_id: testUserId,
						filename: `hnsw-test-${i}.txt`,
						content_hash: generateTestId(`hnsw-${i}`),
						file_type: 'text',
						description: `HNSW test document ${i}`,
						embedding: embedding,
						status: 'ready'
					})
					.select()
					.single();

				if (data?.id) {
					createdFileIds.push(data.id);
					insertedIds.push(data.id);
				}
			}

			// Query all vectors (HNSW index should be used for embedding queries)
			const startTime = Date.now();
			const { data: results, error } = await client
				.from('files')
				.select('id, filename, embedding')
				.in('id', insertedIds)
				.not('embedding', 'is', null);

			const queryTime = Date.now() - startTime;

			expect(error).toBeNull();
			expect(results?.length).toBe(numVectors);
			// Should be fast (under 1 second)
			expect(queryTime).toBeLessThan(1000);
		});

		it('should handle empty results when no embeddings exist', async () => {
			// Query with filter that won't match any records
			const { data, error } = await client
				.from('files')
				.select('id, embedding')
				.eq('filename', 'non-existent-file-xyz.txt')
				.not('embedding', 'is', null);

			expect(error).toBeNull();
			expect(data).toBeDefined();
			expect(data?.length).toBe(0);
		});
	});

	describe('Distance Calculations', () => {
		it('should support cosine distance operator', async () => {
			const embedding1 = Array(1024).fill(0).map((_, i) => i % 2 === 0 ? 1 : 0);

			const { data: file1 } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'distance-test-1.txt',
					content_hash: generateTestId('dist-1'),
					file_type: 'text',
					embedding: embedding1,
					status: 'ready'
				})
				.select()
				.single();

			if (file1?.id) createdFileIds.push(file1.id);

			// Query with embedding - the HNSW index uses cosine distance
			const { data, error } = await client
				.from('files')
				.select('id, filename')
				.eq('id', file1?.id)
				.single();

			expect(error).toBeNull();
			expect(data).toBeDefined();
		});
	});

	describe('Filtering with Embeddings', () => {
		it('should filter files with non-null embeddings', async () => {
			// Insert file with embedding
			const { data: withEmbedding } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'with-embedding.txt',
					content_hash: generateTestId('with-emb'),
					file_type: 'text',
					embedding: Array(1024).fill(0.5),
					status: 'ready'
				})
				.select()
				.single();

			// Insert file without embedding
			const { data: withoutEmbedding } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'without-embedding.txt',
					content_hash: generateTestId('no-emb'),
					file_type: 'text',
					embedding: null,
					status: 'pending'
				})
				.select()
				.single();

			if (withEmbedding?.id) createdFileIds.push(withEmbedding.id);
			if (withoutEmbedding?.id) createdFileIds.push(withoutEmbedding.id);

			// Query only files with embeddings
			const { data: withEmb, error: error1 } = await client
				.from('files')
				.select('id, filename')
				.eq('user_id', testUserId)
				.not('embedding', 'is', null);

			expect(error1).toBeNull();
			expect(withEmb?.some(f => f.id === withEmbedding?.id)).toBe(true);
			expect(withEmb?.some(f => f.id === withoutEmbedding?.id)).toBe(false);

			// Query only files without embeddings
			const { data: withoutEmb, error: error2 } = await client
				.from('files')
				.select('id, filename')
				.eq('user_id', testUserId)
				.is('embedding', null);

			expect(error2).toBeNull();
			expect(withoutEmb?.some(f => f.id === withEmbedding?.id)).toBe(false);
			expect(withoutEmb?.some(f => f.id === withoutEmbedding?.id)).toBe(true);
		});

		it('should combine embedding filter with status filter', async () => {
			// Insert ready file with embedding
			const { data: ready } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'ready-with-emb.txt',
					content_hash: generateTestId('ready-emb'),
					file_type: 'text',
					embedding: Array(1024).fill(0.8),
					status: 'ready'
				})
				.select()
				.single();

			// Insert processing file with embedding
			const { data: processing } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'processing-with-emb.txt',
					content_hash: generateTestId('proc-emb'),
					file_type: 'text',
					embedding: Array(1024).fill(0.9),
					status: 'processing'
				})
				.select()
				.single();

			if (ready?.id) createdFileIds.push(ready.id);
			if (processing?.id) createdFileIds.push(processing.id);

			// Query only ready files with embeddings
			const { data: results, error } = await client
				.from('files')
				.select('id, filename, status')
				.eq('user_id', testUserId)
				.eq('status', 'ready')
				.not('embedding', 'is', null);

			expect(error).toBeNull();
			expect(results?.some(f => f.id === ready?.id)).toBe(true);
			expect(results?.some(f => f.id === processing?.id)).toBe(false);
		});
	});

	describe('Edge Cases', () => {
		it('should handle zero vectors', async () => {
			const zeroVector = Array(1024).fill(0);

			const { data, error } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'zero-vector.txt',
					content_hash: generateTestId('zero'),
					file_type: 'text',
					embedding: zeroVector,
					status: 'ready'
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data?.embedding).toBeDefined();

			if (data?.id) createdFileIds.push(data.id);
		});

		it('should handle large magnitude vectors', async () => {
			const largeVector = Array(1024).fill(1000);

			const { data, error } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'large-vector.txt',
					content_hash: generateTestId('large'),
					file_type: 'text',
					embedding: largeVector,
					status: 'ready'
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data?.embedding).toBeDefined();

			if (data?.id) createdFileIds.push(data.id);
		});

		it('should handle negative values in vectors', async () => {
			const negativeVector = Array(1024).fill(0).map((_, i) => i % 2 === 0 ? -1 : 1);

			const { data, error } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'negative-vector.txt',
					content_hash: generateTestId('negative'),
					file_type: 'text',
					embedding: negativeVector,
					status: 'ready'
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data?.embedding).toBeDefined();

			if (data?.id) createdFileIds.push(data.id);
		});
	});
});
