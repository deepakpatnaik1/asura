/**
 * Files Table CRUD Operations Tests
 *
 * Tests Create, Read, Update, Delete operations on the files table:
 * - Insert file records
 * - Read file records by ID
 * - Update file status/progress/stage
 * - Delete file records
 * - List files filtered by user_id
 * - Query files by status
 * - Query files by content_hash (duplicate detection)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createTestSupabaseClient, generateTestId, cleanupTestData } from '../../helpers';

describe('Files Table CRUD Operations', () => {
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

	describe('Create (INSERT)', () => {
		it('should insert a file record with required fields', async () => {
			const contentHash = generateTestId('crud-insert');

			const { data, error } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'test-file.pdf',
					content_hash: contentHash,
					file_type: 'pdf',
					status: 'pending'
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data).toBeDefined();
			expect(data?.id).toBeDefined();
			expect(data?.filename).toBe('test-file.pdf');
			expect(data?.file_type).toBe('pdf');
			expect(data?.status).toBe('pending');
			expect(data?.progress).toBe(0);
			expect(data?.uploaded_at).toBeDefined();
			expect(data?.updated_at).toBeDefined();

			if (data?.id) createdFileIds.push(data.id);
		});

		it('should insert a file with all optional fields', async () => {
			const contentHash = generateTestId('crud-insert-full');
			const mockEmbedding = Array(1024).fill(0.1);

			const { data, error } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'complete-file.txt',
					content_hash: contentHash,
					file_type: 'text',
					description: 'This is a test file description',
					embedding: mockEmbedding,
					status: 'ready',
					processing_stage: 'finalization',
					progress: 100,
					error_message: null
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data).toBeDefined();
			expect(data?.description).toBe('This is a test file description');
			expect(data?.status).toBe('ready');
			expect(data?.progress).toBe(100);
			expect(data?.processing_stage).toBe('finalization');

			if (data?.id) createdFileIds.push(data.id);
		});

		it('should auto-generate UUID for id field', async () => {
			const contentHash = generateTestId('crud-uuid');

			const { data, error } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'uuid-test.txt',
					content_hash: contentHash,
					file_type: 'text'
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data?.id).toBeDefined();
			// Check UUID format (8-4-4-4-12)
			expect(data?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

			if (data?.id) createdFileIds.push(data.id);
		});

		it('should allow multiple files with different content_hash', async () => {
			const hash1 = generateTestId('crud-multi-1');
			const hash2 = generateTestId('crud-multi-2');

			const { data: file1, error: error1 } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'file1.txt',
					content_hash: hash1,
					file_type: 'text'
				})
				.select()
				.single();

			const { data: file2, error: error2 } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'file2.txt',
					content_hash: hash2,
					file_type: 'text'
				})
				.select()
				.single();

			expect(error1).toBeNull();
			expect(error2).toBeNull();
			expect(file1?.id).not.toBe(file2?.id);

			if (file1?.id) createdFileIds.push(file1.id);
			if (file2?.id) createdFileIds.push(file2.id);
		});
	});

	describe('Read (SELECT)', () => {
		it('should read a file record by ID', async () => {
			const contentHash = generateTestId('crud-read');

			// Insert test file
			const { data: inserted, error: insertError } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'read-test.txt',
					content_hash: contentHash,
					file_type: 'text'
				})
				.select()
				.single();

			expect(insertError).toBeNull();
			if (inserted?.id) createdFileIds.push(inserted.id);

			// Read by ID
			const { data, error } = await client
				.from('files')
				.select('*')
				.eq('id', inserted?.id)
				.single();

			expect(error).toBeNull();
			expect(data).toBeDefined();
			expect(data?.id).toBe(inserted?.id);
			expect(data?.filename).toBe('read-test.txt');
		});

		it('should return null for non-existent ID', async () => {
			const fakeId = '00000000-0000-0000-0000-999999999999';

			const { data, error } = await client
				.from('files')
				.select('*')
				.eq('id', fakeId)
				.maybeSingle();

			// Should not error, but data should be null
			expect(error).toBeNull();
			expect(data).toBeNull();
		});

		it('should list files filtered by user_id', async () => {
			const userId1 = '00000000-0000-0000-0000-000000000001';
			const userId2 = '00000000-0000-0000-0000-000000000002';

			// Insert files for user 1
			const { data: file1, error: error1 } = await client
				.from('files')
				.insert({
					user_id: userId1,
					filename: 'user1-file.txt',
					content_hash: generateTestId('user1'),
					file_type: 'text'
				})
				.select()
				.single();

			// Insert files for user 2
			const { data: file2, error: error2 } = await client
				.from('files')
				.insert({
					user_id: userId2,
					filename: 'user2-file.txt',
					content_hash: generateTestId('user2'),
					file_type: 'text'
				})
				.select()
				.single();

			if (file1?.id) createdFileIds.push(file1.id);
			if (file2?.id) createdFileIds.push(file2.id);

			// Query user 1's files
			const { data: user1Files, error: queryError } = await client
				.from('files')
				.select('*')
				.eq('user_id', userId1);

			expect(queryError).toBeNull();
			expect(user1Files).toBeDefined();
			expect(user1Files?.length).toBeGreaterThanOrEqual(1);

			// All returned files should belong to user 1
			user1Files?.forEach(file => {
				expect(file.user_id).toBe(userId1);
			});
		});

		it('should query files by status', async () => {
			// Insert files with different statuses
			const { data: pendingFile } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'pending-file.txt',
					content_hash: generateTestId('pending'),
					file_type: 'text',
					status: 'pending'
				})
				.select()
				.single();

			const { data: readyFile } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'ready-file.txt',
					content_hash: generateTestId('ready'),
					file_type: 'text',
					status: 'ready'
				})
				.select()
				.single();

			if (pendingFile?.id) createdFileIds.push(pendingFile.id);
			if (readyFile?.id) createdFileIds.push(readyFile.id);

			// Query by status
			const { data: readyFiles, error } = await client
				.from('files')
				.select('*')
				.eq('status', 'ready');

			expect(error).toBeNull();
			expect(readyFiles).toBeDefined();

			// Check that all returned files have 'ready' status
			readyFiles?.forEach(file => {
				expect(file.status).toBe('ready');
			});
		});

		it('should query files by content_hash for duplicate detection', async () => {
			const contentHash = generateTestId('duplicate-check');

			// Insert file
			const { data: inserted } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'original-file.txt',
					content_hash: contentHash,
					file_type: 'text'
				})
				.select()
				.single();

			if (inserted?.id) createdFileIds.push(inserted.id);

			// Check for duplicate by content_hash
			const { data: duplicates, error } = await client
				.from('files')
				.select('*')
				.eq('content_hash', contentHash);

			expect(error).toBeNull();
			expect(duplicates).toBeDefined();
			expect(duplicates?.length).toBe(1);
			expect(duplicates?.[0].id).toBe(inserted?.id);
		});

		it('should select specific columns', async () => {
			const contentHash = generateTestId('select-cols');

			const { data: inserted } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'select-test.txt',
					content_hash: contentHash,
					file_type: 'text',
					description: 'Test description'
				})
				.select()
				.single();

			if (inserted?.id) createdFileIds.push(inserted.id);

			// Select only specific columns
			const { data, error } = await client
				.from('files')
				.select('id, filename, status')
				.eq('id', inserted?.id)
				.single();

			expect(error).toBeNull();
			expect(data).toBeDefined();
			expect(data?.id).toBeDefined();
			expect(data?.filename).toBeDefined();
			expect(data?.status).toBeDefined();
			// Description should not be returned
			expect((data as any)?.description).toBeUndefined();
		});
	});

	describe('Update (UPDATE)', () => {
		it('should update file status', async () => {
			const contentHash = generateTestId('update-status');

			// Insert file
			const { data: inserted } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'status-update.txt',
					content_hash: contentHash,
					file_type: 'text',
					status: 'pending'
				})
				.select()
				.single();

			if (inserted?.id) createdFileIds.push(inserted.id);

			// Update status
			const { data: updated, error } = await client
				.from('files')
				.update({ status: 'processing' })
				.eq('id', inserted?.id)
				.select()
				.single();

			expect(error).toBeNull();
			expect(updated?.status).toBe('processing');
		});

		it('should update progress and processing_stage', async () => {
			const contentHash = generateTestId('update-progress');

			// Insert file
			const { data: inserted } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'progress-update.txt',
					content_hash: contentHash,
					file_type: 'text',
					status: 'processing',
					progress: 0
				})
				.select()
				.single();

			if (inserted?.id) createdFileIds.push(inserted.id);

			// Update progress and stage
			const { data: updated, error } = await client
				.from('files')
				.update({
					progress: 50,
					processing_stage: 'compression'
				})
				.eq('id', inserted?.id)
				.select()
				.single();

			expect(error).toBeNull();
			expect(updated?.progress).toBe(50);
			expect(updated?.processing_stage).toBe('compression');
		});

		it('should update description and embedding', async () => {
			const contentHash = generateTestId('update-content');
			const mockEmbedding = Array(1024).fill(0.5);

			// Insert file
			const { data: inserted } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'content-update.txt',
					content_hash: contentHash,
					file_type: 'text'
				})
				.select()
				.single();

			if (inserted?.id) createdFileIds.push(inserted.id);

			// Update description and embedding
			const { data: updated, error } = await client
				.from('files')
				.update({
					description: 'Updated description',
					embedding: mockEmbedding
				})
				.eq('id', inserted?.id)
				.select()
				.single();

			expect(error).toBeNull();
			expect(updated?.description).toBe('Updated description');
			expect(updated?.embedding).toBeDefined();
		});

		it('should update error_message on failure', async () => {
			const contentHash = generateTestId('update-error');

			// Insert file
			const { data: inserted } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'error-update.txt',
					content_hash: contentHash,
					file_type: 'text',
					status: 'processing'
				})
				.select()
				.single();

			if (inserted?.id) createdFileIds.push(inserted.id);

			// Update to failed status with error message
			const { data: updated, error } = await client
				.from('files')
				.update({
					status: 'failed',
					error_message: 'Extraction failed: Invalid PDF format'
				})
				.eq('id', inserted?.id)
				.select()
				.single();

			expect(error).toBeNull();
			expect(updated?.status).toBe('failed');
			expect(updated?.error_message).toBe('Extraction failed: Invalid PDF format');
		});

		it('should update multiple fields in one operation', async () => {
			const contentHash = generateTestId('update-multi');

			// Insert file
			const { data: inserted } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'multi-update.txt',
					content_hash: contentHash,
					file_type: 'text',
					status: 'pending'
				})
				.select()
				.single();

			if (inserted?.id) createdFileIds.push(inserted.id);

			// Update multiple fields
			const { data: updated, error } = await client
				.from('files')
				.update({
					status: 'ready',
					progress: 100,
					processing_stage: 'finalization',
					description: 'Final description'
				})
				.eq('id', inserted?.id)
				.select()
				.single();

			expect(error).toBeNull();
			expect(updated?.status).toBe('ready');
			expect(updated?.progress).toBe(100);
			expect(updated?.processing_stage).toBe('finalization');
			expect(updated?.description).toBe('Final description');
		});
	});

	describe('Delete (DELETE)', () => {
		it('should delete a file record by ID', async () => {
			const contentHash = generateTestId('delete-test');

			// Insert file
			const { data: inserted } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'delete-test.txt',
					content_hash: contentHash,
					file_type: 'text'
				})
				.select()
				.single();

			const fileId = inserted?.id;

			// Delete file
			const { error: deleteError } = await client
				.from('files')
				.delete()
				.eq('id', fileId);

			expect(deleteError).toBeNull();

			// Verify file is deleted
			const { data: queried, error: queryError } = await client
				.from('files')
				.select('*')
				.eq('id', fileId)
				.maybeSingle();

			expect(queryError).toBeNull();
			expect(queried).toBeNull();
		});

		it('should not error when deleting non-existent ID', async () => {
			const fakeId = '00000000-0000-0000-0000-999999999999';

			const { error } = await client
				.from('files')
				.delete()
				.eq('id', fakeId);

			// Should not error (idempotent operation)
			expect(error).toBeNull();
		});

		it('should delete multiple files with filter', async () => {
			const batchId = generateTestId('batch-delete');

			// Insert multiple files with same prefix
			const file1Hash = `${batchId}-1`;
			const file2Hash = `${batchId}-2`;

			const { data: file1 } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'batch-1.txt',
					content_hash: file1Hash,
					file_type: 'text',
					status: 'failed'
				})
				.select()
				.single();

			const { data: file2 } = await client
				.from('files')
				.insert({
					user_id: testUserId,
					filename: 'batch-2.txt',
					content_hash: file2Hash,
					file_type: 'text',
					status: 'failed'
				})
				.select()
				.single();

			// Delete all failed files for user
			const { error: deleteError } = await client
				.from('files')
				.delete()
				.eq('user_id', testUserId)
				.eq('status', 'failed');

			expect(deleteError).toBeNull();

			// Verify both files are deleted
			const { data: queried1 } = await client
				.from('files')
				.select('*')
				.eq('id', file1?.id)
				.maybeSingle();

			const { data: queried2 } = await client
				.from('files')
				.select('*')
				.eq('id', file2?.id)
				.maybeSingle();

			expect(queried1).toBeNull();
			expect(queried2).toBeNull();
		});
	});
});
