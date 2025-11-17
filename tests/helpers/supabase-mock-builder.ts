/**
 * Supabase Mock Chain Builder
 *
 * Helper to create complex Supabase query chains for testing.
 * Simplifies mock setup for common patterns.
 */

import { vi } from 'vitest';

export interface MockSupabaseChainOptions {
	insertData?: any;
	insertError?: any;
	updateError?: any;
	selectData?: any;
	selectError?: any;
}

/**
 * Create a mock Supabase client with pre-configured query chains
 *
 * Usage:
 * ```ts
 * const mockSupabase = createMockSupabaseChain({
 *   insertData: [{ id: 'test-id' }],
 *   selectData: []
 * });
 * ```
 */
export function createMockSupabaseChain(options: MockSupabaseChainOptions = {}) {
	return {
		from: vi.fn(() => ({
			// INSERT chain
			insert: vi.fn(() => ({
				select: vi.fn().mockResolvedValue({
					data: options.insertData ?? null,
					error: options.insertError ?? null
				})
			})),

			// UPDATE chain
			update: vi.fn(() => ({
				eq: vi.fn().mockResolvedValue({
					data: null,
					error: options.updateError ?? null
				})
			})),

			// SELECT chain
			select: vi.fn(() => ({
				eq: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue({
					data: options.selectData ?? null,
					error: options.selectError ?? null
				}),
				// Support nested eq chains
				then: vi.fn((resolve) =>
					resolve({
						eq: vi.fn().mockReturnThis(),
						limit: vi.fn().mockResolvedValue({
							data: options.selectData ?? null,
							error: options.selectError ?? null
						})
					})
				)
			}))
		}))
	};
}

/**
 * Create a flexible mock Supabase client that supports chaining
 *
 * Usage for file-processor tests:
 * ```ts
 * const mockSupabase = createFlexibleSupabaseMock();
 * mockSupabase.from.mockReturnValue({
 *   insert: vi.fn().mockReturnValue({
 *     select: vi.fn().mockResolvedValue({ data: [{ id: 'test-id' }], error: null })
 *   }),
 *   // ... other chains
 * });
 * ```
 */
export function createFlexibleSupabaseMock() {
	return {
		from: vi.fn(() => ({
			insert: vi.fn().mockReturnThis(),
			update: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			delete: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue({ data: [], error: null })
		}))
	};
}
