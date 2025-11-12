/**
 * Supabase Client Mock Factory
 *
 * Provides mock implementations of Supabase client for testing.
 * Use these mocks to avoid making real API calls during tests.
 */

import { vi } from 'vitest';

/**
 * Create a mock Supabase client with all methods stubbed
 */
export function createMockSupabaseClient() {
	return {
		from: vi.fn(() => ({
			select: vi.fn().mockReturnThis(),
			insert: vi.fn().mockReturnThis(),
			update: vi.fn().mockReturnThis(),
			delete: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			neq: vi.fn().mockReturnThis(),
			gt: vi.fn().mockReturnThis(),
			gte: vi.fn().mockReturnThis(),
			lt: vi.fn().mockReturnThis(),
			lte: vi.fn().mockReturnThis(),
			like: vi.fn().mockReturnThis(),
			ilike: vi.fn().mockReturnThis(),
			is: vi.fn().mockReturnThis(),
			in: vi.fn().mockReturnThis(),
			contains: vi.fn().mockReturnThis(),
			containedBy: vi.fn().mockReturnThis(),
			range: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			limit: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({ data: null, error: null }),
			maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
			csv: vi.fn().mockResolvedValue({ data: '', error: null }),
			// Default response for chained calls
			then: vi.fn((resolve) => resolve({ data: [], error: null }))
		})),

		storage: {
			from: vi.fn(() => ({
				upload: vi.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null }),
				download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
				remove: vi.fn().mockResolvedValue({ data: null, error: null }),
				list: vi.fn().mockResolvedValue({ data: [], error: null }),
				createSignedUrl: vi.fn().mockResolvedValue({
					data: { signedUrl: 'https://test.supabase.co/signed-url' },
					error: null
				}),
				getPublicUrl: vi.fn().mockReturnValue({
					data: { publicUrl: 'https://test.supabase.co/public-url' }
				})
			}))
		},

		auth: {
			getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
			getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
			signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
			signOut: vi.fn().mockResolvedValue({ error: null }),
			onAuthStateChange: vi.fn(() => ({
				data: { subscription: { unsubscribe: vi.fn() } }
			}))
		},

		rpc: vi.fn().mockResolvedValue({ data: null, error: null })
	};
}

/**
 * Create a mock Supabase query response
 */
export function createMockSupabaseResponse<T>(data: T, error: any = null) {
	return {
		data,
		error,
		count: Array.isArray(data) ? data.length : null,
		status: error ? 400 : 200,
		statusText: error ? 'Bad Request' : 'OK'
	};
}

/**
 * Create a mock Supabase error
 */
export function createMockSupabaseError(message: string, code?: string) {
	return {
		message,
		code: code || 'PGRST000',
		details: '',
		hint: ''
	};
}

/**
 * Create a mock file upload result
 */
export function createMockFileUploadResult(fileName: string, bucket: string = 'files') {
	return {
		data: {
			path: `${bucket}/${fileName}`,
			id: 'mock-file-id',
			fullPath: `${bucket}/${fileName}`
		},
		error: null
	};
}

/**
 * Create a mock storage object
 */
export function createMockStorageObject(name: string, size: number = 1024) {
	return {
		name,
		id: 'mock-id',
		updated_at: new Date().toISOString(),
		created_at: new Date().toISOString(),
		last_accessed_at: new Date().toISOString(),
		metadata: {
			size,
			mimetype: 'application/octet-stream',
			cacheControl: 'no-cache'
		}
	};
}
