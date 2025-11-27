/**
 * Supabase Client Mock
 *
 * Provides mock implementations for Supabase operations used in tests.
 */

import { vi } from 'vitest';
import type { User, Session } from '@supabase/supabase-js';

// Mock user data
export const mockUser: User = {
	id: 'test-user-id-12345',
	email: 'test@example.com',
	app_metadata: {},
	user_metadata: {},
	aud: 'authenticated',
	created_at: '2024-01-01T00:00:00.000Z'
};

export const mockSession: Session = {
	access_token: 'test-access-token',
	refresh_token: 'test-refresh-token',
	token_type: 'bearer',
	expires_in: 3600,
	expires_at: Date.now() / 1000 + 3600,
	user: mockUser
};

// Mock Supabase query builder
export function createMockQueryBuilder<T>(data: T | null = null, error: Error | null = null) {
	const builder = {
		select: vi.fn().mockReturnThis(),
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		neq: vi.fn().mockReturnThis(),
		gt: vi.fn().mockReturnThis(),
		lt: vi.fn().mockReturnThis(),
		gte: vi.fn().mockReturnThis(),
		lte: vi.fn().mockReturnThis(),
		like: vi.fn().mockReturnThis(),
		ilike: vi.fn().mockReturnThis(),
		is: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data, error }),
		maybeSingle: vi.fn().mockResolvedValue({ data, error }),
		then: vi.fn((resolve) => resolve({ data, error }))
	};

	// Make it thenable for await
	(builder as any)[Symbol.toStringTag] = 'Promise';

	return builder;
}

// Mock Supabase client
export function createMockSupabaseClient(options?: {
	user?: User | null;
	session?: Session | null;
	queryData?: unknown;
	queryError?: Error | null;
}) {
	const user = options?.user ?? mockUser;
	const session = options?.session ?? (user ? mockSession : null);

	return {
		auth: {
			getSession: vi.fn().mockResolvedValue({
				data: { session },
				error: null
			}),
			getUser: vi.fn().mockResolvedValue({
				data: { user },
				error: null
			}),
			signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
			signOut: vi.fn().mockResolvedValue({ error: null })
		},
		from: vi.fn(() => createMockQueryBuilder(options?.queryData, options?.queryError)),
		storage: {
			from: vi.fn(() => ({
				upload: vi.fn().mockResolvedValue({ data: { path: 'test-path' }, error: null }),
				download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
				remove: vi.fn().mockResolvedValue({ data: [], error: null }),
				getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.url' } })
			}))
		},
		rpc: vi.fn().mockResolvedValue({ data: null, error: null })
	};
}

// Mock safeGetSession function
export function createMockSafeGetSession(user: User | null = mockUser) {
	return vi.fn().mockResolvedValue({
		session: user ? mockSession : null,
		user
	});
}

// Type for mock locals
export interface MockLocals {
	safeGetSession: ReturnType<typeof createMockSafeGetSession>;
	supabase: ReturnType<typeof createMockSupabaseClient>;
}

// Create mock locals for request handlers
export function createMockLocals(options?: {
	authenticated?: boolean;
	user?: User;
	queryData?: unknown;
	queryError?: Error | null;
}): MockLocals {
	const authenticated = options?.authenticated ?? true;
	const user = authenticated ? (options?.user ?? mockUser) : null;

	return {
		safeGetSession: createMockSafeGetSession(user),
		supabase: createMockSupabaseClient({
			user,
			queryData: options?.queryData,
			queryError: options?.queryError
		})
	};
}
