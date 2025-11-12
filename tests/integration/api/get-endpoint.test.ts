/**
 * Get File API Endpoint Integration Tests
 *
 * Tests the GET /api/files/[id] endpoint:
 * - Authentication validation
 * - UUID validation
 * - File retrieval
 * - Response format
 * - Database integration
 * - Error handling
 *
 * NOTE: Currently userId = null (no auth implemented yet)
 * All requests will return 401 until Chunk 11 is complete.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { GET } from '$routes/api/files/[id]/+server';
import { createTestSupabaseClient, generateTestId } from '../../helpers';

describe('Get File API Endpoint', () => {
	const supabase = createTestSupabaseClient();
	const createdFileIds: string[] = [];
	const testUserId = '00000000-0000-0000-0000-000000000001';

	afterEach(async () => {
		// Cleanup created test files
		for (const id of createdFileIds) {
			await supabase.from('files').delete().eq('id', id);
		}
		createdFileIds.length = 0;
	});

	describe('Authentication', () => {
		it('should return 401 when userId is null (no auth)', async () => {
			const fileId = '00000000-0000-0000-0000-000000000999';
			const request = new Request(`http://localhost/api/files/${fileId}`, {
				method: 'GET'
			});

			const response = await GET({
				request,
				params: { id: fileId },
				locals: {} as any
			});
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data).toEqual({
				error: {
					message: 'Authentication required',
					code: 'AUTH_REQUIRED'
				}
			});
		});

		it('should include proper error structure in 401 response', async () => {
			const fileId = '00000000-0000-0000-0000-000000000999';
			const request = new Request(`http://localhost/api/files/${fileId}`, {
				method: 'GET'
			});

			const response = await GET({
				request,
				params: { id: fileId },
				locals: {} as any
			});
			const data = await response.json();

			expect(data).toHaveProperty('error');
			expect(data.error).toHaveProperty('message');
			expect(data.error).toHaveProperty('code');
			expect(data.error.message).toBe('Authentication required');
			expect(data.error.code).toBe('AUTH_REQUIRED');
		});
	});

	describe('UUID Validation', () => {
		it('should reject invalid UUID format (too short)', async () => {
			const invalidId = 'invalid';
			const request = new Request(`http://localhost/api/files/${invalidId}`, {
				method: 'GET'
			});

			const response = await GET({
				request,
				params: { id: invalidId },
				locals: {} as any
			});

			// Currently returns 401, but should return 400 with INVALID_FILE_ID after auth
			expect(response.status).toBe(401);
		});

		it('should reject invalid UUID format (wrong pattern)', async () => {
			const invalidId = 'not-a-uuid-at-all-here';
			const request = new Request(`http://localhost/api/files/${invalidId}`, {
				method: 'GET'
			});

			const response = await GET({
				request,
				params: { id: invalidId },
				locals: {} as any
			});

			expect(response.status).toBe(401);
		});

		it('should reject invalid UUID format (missing hyphens)', async () => {
			const invalidId = '00000000000000000000000000000000';
			const request = new Request(`http://localhost/api/files/${invalidId}`, {
				method: 'GET'
			});

			const response = await GET({
				request,
				params: { id: invalidId },
				locals: {} as any
			});

			expect(response.status).toBe(401);
		});

		it('should reject invalid UUID format (special characters)', async () => {
			const invalidId = '00000000-0000-0000-0000-00000000000!';
			const request = new Request(`http://localhost/api/files/${invalidId}`, {
				method: 'GET'
			});

			const response = await GET({
				request,
				params: { id: invalidId },
				locals: {} as any
			});

			expect(response.status).toBe(401);
		});

		it('should accept valid UUID format', async () => {
			const validId = '00000000-0000-0000-0000-000000000999';
			const request = new Request(`http://localhost/api/files/${validId}`, {
				method: 'GET'
			});

			const response = await GET({
				request,
				params: { id: validId },
				locals: {} as any
			});

			// Currently returns 401 (no auth), not 400 (invalid UUID)
			expect(response.status).toBe(401);
		});

		it('should accept UUID with uppercase letters', async () => {
			const validId = '00000000-0000-0000-0000-00000000ABCD';
			const request = new Request(`http://localhost/api/files/${validId}`, {
				method: 'GET'
			});

			const response = await GET({
				request,
				params: { id: validId },
				locals: {} as any
			});

			// UUIDs are case-insensitive
			expect(response.status).toBe(401);
		});
	});

	describe('Response Format', () => {
		it('should return JSON response', async () => {
			const fileId = '00000000-0000-0000-0000-000000000999';
			const request = new Request(`http://localhost/api/files/${fileId}`, {
				method: 'GET'
			});

			const response = await GET({
				request,
				params: { id: fileId },
				locals: {} as any
			});

			expect(response.headers.get('content-type')).toContain('application/json');
		});

		it('should return proper error structure', async () => {
			const fileId = '00000000-0000-0000-0000-000000000999';
			const request = new Request(`http://localhost/api/files/${fileId}`, {
				method: 'GET'
			});

			const response = await GET({
				request,
				params: { id: fileId },
				locals: {} as any
			});
			const data = await response.json();

			expect(data).toHaveProperty('error');
			expect(data.error).toHaveProperty('message');
			expect(data.error).toHaveProperty('code');
		});
	});

	describe('Error Handling', () => {
		it('should handle empty ID parameter', async () => {
			const request = new Request('http://localhost/api/files/', {
				method: 'GET'
			});

			const response = await GET({
				request,
				params: { id: '' },
				locals: {} as any
			});

			expect(response.status).toBe(401);
		});

		it('should handle null ID parameter', async () => {
			const request = new Request('http://localhost/api/files/null', {
				method: 'GET'
			});

			const response = await GET({
				request,
				params: { id: null as any },
				locals: {} as any
			});

			expect(response.status).toBeGreaterThanOrEqual(400);
		});

		it('should include error code in error responses', async () => {
			const fileId = '00000000-0000-0000-0000-000000000999';
			const request = new Request(`http://localhost/api/files/${fileId}`, {
				method: 'GET'
			});

			const response = await GET({
				request,
				params: { id: fileId },
				locals: {} as any
			});
			const data = await response.json();

			expect(data.error).toHaveProperty('code');
			expect(typeof data.error.code).toBe('string');
		});
	});

	// TODO: Add tests for successful retrieval after auth is implemented
	describe('Successful Retrieval (TODO: Enable after Chunk 11)', () => {
		it.skip('should return file details for existing file', async () => {
			// Create test file in database
			// Query endpoint
			// Verify file returned with all fields
		});

		it.skip('should return 404 for non-existent file', async () => {
			// Query with valid UUID that doesn't exist
			// Should return 404 with FILE_NOT_FOUND
		});

		it.skip('should return 404 for file belonging to different user', async () => {
			// Create file for user A
			// Query as user B
			// Should return 404 (not 403) to not leak file existence
		});

		it.skip('should return all file fields', async () => {
			// Verify response includes all table columns
		});

		it.skip('should handle database errors gracefully', async () => {
			// Mock database error
			// Should return 500 with DATABASE_ERROR
		});

		it.skip('should use single() query correctly', async () => {
			// Verify that single() is used (not maybeSingle or first)
			// This ensures proper error handling
		});
	});
});
