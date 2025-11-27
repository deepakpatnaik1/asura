/**
 * User Test Fixtures
 *
 * Sample user data for testing authentication and user-scoped operations.
 */

import type { User, Session } from '@supabase/supabase-js';

export const testUser1: User = {
	id: 'user-1-test-uuid-12345',
	email: 'alice@example.com',
	app_metadata: { provider: 'google' },
	user_metadata: { name: 'Alice Test' },
	aud: 'authenticated',
	created_at: '2024-01-01T00:00:00.000Z'
};

export const testUser2: User = {
	id: 'user-2-test-uuid-67890',
	email: 'bob@example.com',
	app_metadata: { provider: 'google' },
	user_metadata: { name: 'Bob Test' },
	aud: 'authenticated',
	created_at: '2024-02-01T00:00:00.000Z'
};

export const testAdminUser: User = {
	id: 'admin-test-uuid-admin',
	email: 'admin@example.com',
	app_metadata: { provider: 'google', is_admin: true },
	user_metadata: { name: 'Admin User' },
	aud: 'authenticated',
	created_at: '2024-01-01T00:00:00.000Z'
};

export function createTestSession(user: User): Session {
	return {
		access_token: `access-token-${user.id}`,
		refresh_token: `refresh-token-${user.id}`,
		token_type: 'bearer',
		expires_in: 3600,
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		user
	};
}

export const testSession1 = createTestSession(testUser1);
export const testSession2 = createTestSession(testUser2);
export const testAdminSession = createTestSession(testAdminUser);
