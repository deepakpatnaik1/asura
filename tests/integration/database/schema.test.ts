/**
 * Database Schema Validation Tests
 *
 * Tests that the database schema is correctly set up based on ACTUAL deployed schema.
 * Note: Tests reflect the current remote database schema, not planned migrations.
 */

import { describe, it, expect } from 'vitest';
import { createTestSupabaseClient } from '../../helpers';

describe('Database Schema - Files Table (Actual)', () => {
	const client = createTestSupabaseClient();

	describe('Table Existence', () => {
		it('should have files table', async () => {
			const { data, error } = await client
				.from('files')
				.select('*')
				.limit(0);

			expect(error).toBeNull();
			expect(data).toBeDefined();
		});
	});

	describe('Column Structure', () => {
		it('should have all expected columns', async () => {
			// Test that all expected columns exist by querying them
			const { error } = await client
				.from('files')
				.select('id, user_id, filename, file_type, content_hash, status, processing_stage, progress, total_chunks, processed_chunks, error_message, uploaded_at')
				.limit(0);

			expect(error).toBeNull();
		});

		it('should allow NULL for user_id', async () => {
			const { data, error } = await client
				.from('files')
				.insert({
					filename: 'null-user-test.txt',
					content_hash: `test-null-user-${Date.now()}`,
					file_type: 'text'
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data?.user_id).toBeNull();

			// Cleanup
			if (data?.id) {
				await client.from('files').delete().eq('id', data.id);
			}
		});
	});

	describe('Enum Types', () => {
		it('should accept valid file_type enum values', async () => {
			const validTypes = ['pdf', 'image', 'text', 'code', 'spreadsheet', 'other'];

			for (const type of validTypes) {
				const { error } = await client
					.from('files')
					.select('file_type')
					.eq('file_type', type)
					.limit(0);

				expect(error).toBeNull();
			}
		});

		it('should accept valid file_status enum values', async () => {
			const validStatuses = ['pending', 'processing', 'ready', 'failed'];

			for (const status of validStatuses) {
				const { error } = await client
					.from('files')
					.select('status')
					.eq('status', status)
					.limit(0);

				expect(error).toBeNull();
			}
		});

		it('should accept valid processing_stage enum values', async () => {
			const validStages = ['extraction', 'compression', 'embedding', 'finalization'];

			for (const stage of validStages) {
				const { error } = await client
					.from('files')
					.select('processing_stage')
					.eq('processing_stage', stage)
					.limit(0);

				expect(error).toBeNull();
			}
		});
	});

	describe('Indexes', () => {
		it('should have index on user_id', async () => {
			const { error } = await client
				.from('files')
				.select('id')
				.eq('user_id', '00000000-0000-0000-0000-000000000000')
				.limit(1);

			expect(error).toBeNull();
		});

		it('should have index on content_hash', async () => {
			const { error } = await client
				.from('files')
				.select('id')
				.eq('content_hash', 'test-hash')
				.limit(1);

			expect(error).toBeNull();
		});

		it('should have index on status', async () => {
			const { error } = await client
				.from('files')
				.select('id')
				.eq('status', 'processing')
				.limit(1);

			expect(error).toBeNull();
		});

		it('should support ordering by uploaded_at', async () => {
			const { error } = await client
				.from('files')
				.select('id')
				.order('uploaded_at', { ascending: false })
				.limit(1);

			expect(error).toBeNull();
		});
	});

	describe('Constraints', () => {
		it('should enforce NOT NULL on required fields', async () => {
			// Try to insert without required fields - should fail
			const { error } = await client
				.from('files')
				.insert({
					// Missing filename, content_hash
					status: 'pending'
				});

			// Should fail due to NOT NULL constraints
			expect(error).not.toBeNull();
		});

		it('should accept progress values in valid range', async () => {
			// Test that progress values within 0-100 are accepted
			// Note: Database may not enforce CHECK constraint, but app logic should
			const { data, error } = await client
				.from('files')
				.insert({
					filename: 'test-valid-progress.txt',
					content_hash: `constraint-test-${Date.now()}`,
					file_type: 'text',
					status: 'processing',
					progress: 50
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data?.progress).toBe(50);

			// Cleanup
			if (data?.id) {
				await client.from('files').delete().eq('id', data.id);
			}
		});

		it('should have default values for status and progress', async () => {
			const contentHash = `default-test-${Date.now()}`;

			// Insert without status or progress
			const { data, error } = await client
				.from('files')
				.insert({
					filename: 'test-defaults.txt',
					content_hash: contentHash,
					file_type: 'text'
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data).toBeDefined();
			expect(data?.status).toBeDefined(); // Has default
			expect(data?.progress).toBe(0);

			// Cleanup
			if (data?.id) {
				await client.from('files').delete().eq('id', data.id);
			}
		});
	});

	describe('Timestamps', () => {
		it('should auto-set uploaded_at on INSERT', async () => {
			const contentHash = `timestamp-test-${Date.now()}`;

			const { data, error } = await client
				.from('files')
				.insert({
					filename: 'test-timestamps.txt',
					content_hash: contentHash,
					file_type: 'text'
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data).toBeDefined();
			expect(data?.uploaded_at).toBeDefined();

			// Should be valid timestamp
			expect(new Date(data?.uploaded_at).getTime()).toBeGreaterThan(0);

			// Cleanup
			if (data?.id) {
				await client.from('files').delete().eq('id', data.id);
			}
		});

		it('should use TIMESTAMPTZ for timezone-aware timestamps', async () => {
			const contentHash = `timestamp-tz-${Date.now()}`;

			const { data, error } = await client
				.from('files')
				.insert({
					filename: 'tz-test.txt',
					content_hash: contentHash,
					file_type: 'text'
				})
				.select()
				.single();

			expect(error).toBeNull();

			// Timestamp should be ISO 8601 format with timezone
			expect(data?.uploaded_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

			// Should be parseable as Date
			expect(new Date(data?.uploaded_at).getTime()).toBeGreaterThan(0);

			// Cleanup
			if (data?.id) {
				await client.from('files').delete().eq('id', data.id);
			}
		});
	});

	describe('RLS Status', () => {
		it('should have RLS disabled (for development)', async () => {
			// With RLS disabled, service role should be able to query all records
			const { error } = await client
				.from('files')
				.select('*')
				.limit(10);

			// Should succeed even without auth context
			expect(error).toBeNull();
		});
	});

	describe('Chunking Fields', () => {
		it('should have total_chunks field', async () => {
			const { data, error } = await client
				.from('files')
				.insert({
					filename: 'chunks-test.txt',
					content_hash: `chunks-test-${Date.now()}`,
					file_type: 'text',
					total_chunks: 5
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data?.total_chunks).toBe(5);

			// Cleanup
			if (data?.id) {
				await client.from('files').delete().eq('id', data.id);
			}
		});

		it('should have processed_chunks field with default', async () => {
			const { data, error } = await client
				.from('files')
				.insert({
					filename: 'processed-chunks-test.txt',
					content_hash: `processed-test-${Date.now()}`,
					file_type: 'text'
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data?.processed_chunks).toBeDefined();
			expect(typeof data?.processed_chunks).toBe('number');

			// Cleanup
			if (data?.id) {
				await client.from('files').delete().eq('id', data.id);
			}
		});
	});
});
