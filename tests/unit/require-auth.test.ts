/**
 * Tests for lib/api/require-auth.ts
 *
 * Tests the authentication guard utility.
 */

import { describe, it, expect, vi } from 'vitest';
import { requireAuth } from '$lib/api/require-auth';
import { createMockSafeGetSession, mockUser } from '../mocks/supabase';

describe('requireAuth', () => {
	describe('authenticated user', () => {
		it('returns success with user data', async () => {
			const safeGetSession = createMockSafeGetSession(mockUser);

			const result = await requireAuth(safeGetSession);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.user).toEqual(mockUser);
				expect(result.userId).toBe(mockUser.id);
			}
		});

		it('extracts userId from user object', async () => {
			const customUser = { ...mockUser, id: 'custom-user-id-12345' };
			const safeGetSession = createMockSafeGetSession(customUser);

			const result = await requireAuth(safeGetSession);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.userId).toBe('custom-user-id-12345');
			}
		});

		it('calls safeGetSession exactly once', async () => {
			const safeGetSession = createMockSafeGetSession(mockUser);

			await requireAuth(safeGetSession);

			expect(safeGetSession).toHaveBeenCalledTimes(1);
		});
	});

	describe('unauthenticated user', () => {
		it('returns error response when user is null', async () => {
			const safeGetSession = createMockSafeGetSession(null);

			const result = await requireAuth(safeGetSession);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBeInstanceOf(Response);
				expect(result.error.status).toBe(401);
			}
		});

		it('returns UNAUTHORIZED error code', async () => {
			const safeGetSession = createMockSafeGetSession(null);

			const result = await requireAuth(safeGetSession);

			expect(result.success).toBe(false);
			if (!result.success) {
				const body = await result.error.json();
				expect(body.error.code).toBe('UNAUTHORIZED');
				expect(body.error.message).toContain('must be logged in');
			}
		});

		it('returns JSON content type', async () => {
			const safeGetSession = createMockSafeGetSession(null);

			const result = await requireAuth(safeGetSession);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.headers.get('Content-Type')).toBe('application/json');
			}
		});
	});

	describe('session edge cases', () => {
		it('handles session with valid user', async () => {
			const safeGetSession = vi.fn().mockResolvedValue({
				session: { access_token: 'valid-token', user: mockUser },
				user: mockUser
			});

			const result = await requireAuth(safeGetSession);

			expect(result.success).toBe(true);
		});

		it('treats session without user as unauthenticated', async () => {
			const safeGetSession = vi.fn().mockResolvedValue({
				session: { access_token: 'expired-token' },
				user: null
			});

			const result = await requireAuth(safeGetSession);

			expect(result.success).toBe(false);
		});

		it('handles both session and user being null', async () => {
			const safeGetSession = vi.fn().mockResolvedValue({
				session: null,
				user: null
			});

			const result = await requireAuth(safeGetSession);

			expect(result.success).toBe(false);
		});
	});

	describe('error handling', () => {
		it('propagates errors from safeGetSession', async () => {
			const safeGetSession = vi.fn().mockRejectedValue(new Error('Database connection failed'));

			await expect(requireAuth(safeGetSession)).rejects.toThrow('Database connection failed');
		});
	});
});
