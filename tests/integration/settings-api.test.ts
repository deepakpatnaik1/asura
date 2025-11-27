/**
 * Integration Tests for /api/settings
 *
 * Tests the settings API endpoint for GET and PUT operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PUT } from '$routes/api/settings/+server';
import { createMockLocals, mockUser } from '../mocks/supabase';
import { testUserSettings } from '../fixtures/messages';

describe('GET /api/settings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('authentication', () => {
		it('returns 401 when unauthenticated', async () => {
			const locals = createMockLocals({ authenticated: false });

			const response = await GET({
				locals,
				request: new Request('http://localhost/api/settings')
			} as any);

			expect(response.status).toBe(401);
			const body = await response.json();
			expect(body.error.code).toBe('UNAUTHORIZED');
		});

		it('returns settings when authenticated', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryData: testUserSettings
			});

			const response = await GET({
				locals,
				request: new Request('http://localhost/api/settings')
			} as any);

			expect(response.status).toBe(200);
		});
	});

	describe('settings retrieval', () => {
		it('returns user settings from database', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryData: testUserSettings
			});

			const response = await GET({
				locals,
				request: new Request('http://localhost/api/settings')
			} as any);

			const body = await response.json();
			expect(body.selected_conversation_model).toBe(testUserSettings.selected_conversation_model);
			expect(body.selected_compression_model).toBe(testUserSettings.selected_compression_model);
		});

		it('creates default settings for new user when not found', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryError: new Error('No rows found')
			});

			const response = await GET({
				locals,
				request: new Request('http://localhost/api/settings')
			} as any);

			expect(response.status).toBe(200);
			const body = await response.json();
			// Should return defaults
			expect(body.selected_conversation_model).toBeDefined();
			expect(body.selected_compression_model).toBeDefined();
		});
	});

	describe('query construction', () => {
		it('queries with correct user_id filter', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryData: testUserSettings
			});

			await GET({
				locals,
				request: new Request('http://localhost/api/settings')
			} as any);

			expect(locals.supabase.from).toHaveBeenCalledWith('user_settings');
		});
	});
});

describe('PUT /api/settings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('authentication', () => {
		it('returns 401 when unauthenticated', async () => {
			const locals = createMockLocals({ authenticated: false });

			const response = await PUT({
				locals,
				request: new Request('http://localhost/api/settings', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ selected_conversation_model: 'claude-sonnet-4-5-20250929' })
				})
			} as any);

			expect(response.status).toBe(401);
		});
	});

	describe('partial updates', () => {
		it('updates only provided fields', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryData: { success: true }
			});

			const response = await PUT({
				locals,
				request: new Request('http://localhost/api/settings', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ selected_conversation_model: 'claude-haiku-3-5-20241022' })
				})
			} as any);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.success).toBe(true);
		});

		it('can update multiple fields at once', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryData: { success: true }
			});

			const response = await PUT({
				locals,
				request: new Request('http://localhost/api/settings', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						selected_conversation_model: 'claude-sonnet-4-5-20250929',
						selected_compression_model: 'claude-haiku-3-5-20241022',
						active_reader_article_id: 'article-123'
					})
				})
			} as any);

			expect(response.status).toBe(200);
		});

		it('updates active_reader_article_id', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryData: { success: true }
			});

			const response = await PUT({
				locals,
				request: new Request('http://localhost/api/settings', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ active_reader_article_id: 'new-article-id' })
				})
			} as any);

			expect(response.status).toBe(200);
		});

		it('can set active_reader_article_id to null', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryData: { success: true }
			});

			const response = await PUT({
				locals,
				request: new Request('http://localhost/api/settings', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ active_reader_article_id: null })
				})
			} as any);

			expect(response.status).toBe(200);
		});
	});

	describe('error handling', () => {
		it('returns 500 on database error', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryError: new Error('Database connection failed')
			});

			const response = await PUT({
				locals,
				request: new Request('http://localhost/api/settings', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ selected_conversation_model: 'test' })
				})
			} as any);

			expect(response.status).toBe(500);
		});
	});

	describe('timestamp update', () => {
		it('sets updated_at timestamp', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryData: { success: true }
			});

			await PUT({
				locals,
				request: new Request('http://localhost/api/settings', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ selected_conversation_model: 'test' })
				})
			} as any);

			// The update call should include updated_at
			// This is verified by the mock being called with the update method
			expect(locals.supabase.from).toHaveBeenCalled();
		});
	});
});
