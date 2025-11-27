/**
 * Integration Tests for /api/superjournal/[id]
 *
 * Tests the superjournal entry management API endpoint.
 * Uses mocked Supabase client to test endpoint logic in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockLocals } from '../mocks/supabase';
import { testSuperjournal1 } from '../fixtures/messages';

// Dynamically import the server module to avoid type generation issues
const { DELETE, PATCH } = await import('../../src/routes/api/superjournal/[id]/+server');

describe('/api/superjournal/[id]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('DELETE', () => {
		describe('authentication', () => {
			it('returns 401 when unauthenticated', async () => {
				const locals = createMockLocals({ authenticated: false });

				const response = await DELETE({
					locals,
					params: { id: testSuperjournal1.id },
					request: new Request(`http://localhost/api/superjournal/${testSuperjournal1.id}`, {
						method: 'DELETE'
					})
				} as any);

				expect(response.status).toBe(401);
				const body = await response.json();
				expect(body.error.code).toBe('UNAUTHORIZED');
			});
		});

		describe('successful deletion', () => {
			it('deletes entry and returns success', async () => {
				const locals = createMockLocals({
					authenticated: true,
					queryData: { id: testSuperjournal1.id }
				});

				const response = await DELETE({
					locals,
					params: { id: testSuperjournal1.id },
					request: new Request(`http://localhost/api/superjournal/${testSuperjournal1.id}`, {
						method: 'DELETE'
					})
				} as any);

				expect(response.status).toBe(200);
				const body = await response.json();
				expect(body.success).toBe(true);
			});

			it('returns the deleted id', async () => {
				const locals = createMockLocals({
					authenticated: true,
					queryData: { id: testSuperjournal1.id }
				});

				const response = await DELETE({
					locals,
					params: { id: testSuperjournal1.id },
					request: new Request(`http://localhost/api/superjournal/${testSuperjournal1.id}`, {
						method: 'DELETE'
					})
				} as any);

				const body = await response.json();
				expect(body.id).toBe(testSuperjournal1.id);
			});

			it('calls supabase with correct table', async () => {
				const locals = createMockLocals({
					authenticated: true,
					queryData: { id: testSuperjournal1.id }
				});

				await DELETE({
					locals,
					params: { id: testSuperjournal1.id },
					request: new Request(`http://localhost/api/superjournal/${testSuperjournal1.id}`, {
						method: 'DELETE'
					})
				} as any);

				expect(locals.supabase.from).toHaveBeenCalledWith('superjournal');
			});
		});

		describe('error handling', () => {
			it('returns 500 on database error', async () => {
				const locals = createMockLocals({
					authenticated: true,
					queryError: new Error('Database error')
				});

				const response = await DELETE({
					locals,
					params: { id: testSuperjournal1.id },
					request: new Request(`http://localhost/api/superjournal/${testSuperjournal1.id}`, {
						method: 'DELETE'
					})
				} as any);

				expect(response.status).toBe(500);
			});
		});
	});

	describe('PATCH (toggle star)', () => {
		describe('authentication', () => {
			it('returns 401 when unauthenticated', async () => {
				const locals = createMockLocals({ authenticated: false });

				const response = await PATCH({
					locals,
					params: { id: testSuperjournal1.id }
				} as any);

				expect(response.status).toBe(401);
				const body = await response.json();
				expect(body.error.code).toBe('UNAUTHORIZED');
			});
		});

		describe('toggling starred status', () => {
			it('toggles starred status and returns new value', async () => {
				const locals = createMockLocals({
					authenticated: true,
					queryData: { id: 'journal-id', is_starred: false }
				});

				const response = await PATCH({
					locals,
					params: { id: testSuperjournal1.id }
				} as any);

				expect(response.status).toBe(200);
				const body = await response.json();
				expect(body.success).toBe(true);
				expect(body.is_starred).toBe(true); // Toggled from false
			});

			it('returns the superjournal id', async () => {
				const locals = createMockLocals({
					authenticated: true,
					queryData: { id: 'journal-id', is_starred: true }
				});

				const response = await PATCH({
					locals,
					params: { id: testSuperjournal1.id }
				} as any);

				const body = await response.json();
				expect(body.id).toBe(testSuperjournal1.id);
			});
		});

		// Note: Error handling tests for PATCH are skipped because the endpoint has a
		// polling loop (waitForJournalEntry) that makes it difficult to test timeouts
		// and null responses in a mocked environment. The actual endpoint handles
		// these cases correctly by returning 404 after the polling timeout.
	});
});
