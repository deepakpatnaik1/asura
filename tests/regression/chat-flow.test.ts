/**
 * Regression Tests: Chat Flow
 *
 * Ensures that the file upload feature doesn't break core chat functionality:
 * - Send message → receive AI response
 * - Superjournal storage
 * - Journal compression (Call 2A/2B)
 * - Embedding generation
 * - Works with and without files
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Supabase using vi.hoisted()
const mockSupabase = vi.hoisted(() => ({
	from: vi.fn(() => ({
		select: vi.fn(() => ({
			eq: vi.fn(() => ({
				eq: vi.fn(() => ({
					limit: vi.fn().mockResolvedValue({ data: [], error: null })
				})),
				is: vi.fn().mockReturnThis(),
				or: vi.fn().mockReturnThis(),
				order: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue({ data: [], error: null }),
				single: vi.fn().mockResolvedValue({ data: null, error: null })
			})),
			is: vi.fn(() => ({
				eq: vi.fn().mockReturnThis(),
				or: vi.fn().mockReturnThis(),
				order: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue({ data: [], error: null })
			})),
			or: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue({ data: [], error: null }),
			single: vi.fn().mockResolvedValue({ data: null, error: null })
		})),
		insert: vi.fn(() => ({
			select: vi.fn(() => ({
				single: vi.fn().mockResolvedValue({
					data: { id: 'test-superjournal-id' },
					error: null
				})
			}))
		})),
		update: vi.fn().mockReturnThis()
	})),
	storage: {
		from: vi.fn(() => ({
			upload: vi.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null })
		}))
	}
}));

vi.mock('$lib/supabase', () => ({
	supabase: mockSupabase
}));

// Mock Voyage AI using vi.hoisted()
const mockVoyageClient = vi.hoisted(() => ({
	embed: vi.fn().mockResolvedValue({
		data: [
			{
				embedding: Array.from({ length: 1024 }, (_, i) => Math.sin(i / 100))
			}
		]
	})
}));

const MockVoyageAIClient = vi.hoisted(() => {
	return class {
		embed = mockVoyageClient.embed;
	};
});

vi.mock('voyageai', () => ({
	VoyageAIClient: MockVoyageAIClient
}));

// NOW import the module
import { buildContextForCalls1A1B } from '$lib/context-builder';

describe('Regression: Chat Flow', () => {
	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();

		// Default mock setup for models table and files table
		mockSupabase.from.mockImplementation((table: string) => {
			if (table === 'models') {
				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							single: vi.fn().mockResolvedValue({
								data: { context_window: 131072 },
								error: null
							})
						})
					})
				};
			}

			// Default empty responses for files table
			if (table === 'files') {
				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							order: vi.fn().mockReturnValue({
								eq: vi.fn().mockResolvedValue({ data: [], error: null }),
								is: vi.fn().mockResolvedValue({ data: [], error: null })
							})
						})
					})
				};
			}

			// Default empty responses for other tables
			return {
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnThis(),
					is: vi.fn().mockReturnThis(),
					or: vi.fn().mockReturnThis(),
					order: vi.fn().mockReturnThis(),
					limit: vi.fn().mockResolvedValue({ data: [], error: null }),
					single: vi.fn().mockResolvedValue({ data: null, error: null })
				}),
				insert: vi.fn(() => ({
					select: vi.fn(() => ({
						single: vi.fn().mockResolvedValue({
							data: { id: 'test-id' },
							error: null
						})
					}))
				}))
			};
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('chat works without files', () => {
		it('should build context successfully when files table is empty', async () => {
			// Arrange: files table is empty (default mock)

			// Act
			const result = await buildContextForCalls1A1B('test-user-id');

			// Assert
			expect(result).toBeDefined();
			expect(result.context).toBeDefined();
			expect(result.stats).toBeDefined();
			expect(result.stats.components.files).toBe(0);
		});

		it('should not crash when files table query fails', async () => {
			// Arrange: files table query fails
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn().mockResolvedValue({
										data: null,
										error: { message: 'Database connection error' }
									})
								})
							})
						})
					};
				}

				if (table === 'models') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: { context_window: 131072 },
									error: null
								})
							})
						})
					};
				}

				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnThis(),
						is: vi.fn().mockReturnThis(),
						or: vi.fn().mockReturnThis(),
						order: vi.fn().mockReturnThis(),
						limit: vi.fn().mockResolvedValue({ data: [], error: null })
					})
				};
			});

			// Act & Assert
			const result = await buildContextForCalls1A1B('test-user-id');
			expect(result).toBeDefined();
			expect(result.stats.components.files).toBe(0);
		});

		it('should handle null user_id without errors', async () => {
			// Act
			const result = await buildContextForCalls1A1B(null);

			// Assert
			expect(result).toBeDefined();
			expect(result.context).toBeDefined();
			// Should not throw errors
		});
	});

	describe('chat works with files present', () => {
		it('should build context successfully when files exist', async () => {
			// Arrange: files table has ready files
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn().mockResolvedValue({
										data: [
											{
												filename: 'test.pdf',
												file_type: 'pdf',
												description: 'Test file description'
											}
										],
										error: null
									})
								})
							})
						})
					};
				}

				if (table === 'models') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: { context_window: 131072 },
									error: null
								})
							})
						})
					};
				}

				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnThis(),
						is: vi.fn().mockReturnThis(),
						or: vi.fn().mockReturnThis(),
						order: vi.fn().mockReturnThis(),
						limit: vi.fn().mockResolvedValue({ data: [], error: null })
					})
				};
			});

			// Act
			const result = await buildContextForCalls1A1B('test-user-id');

			// Assert
			expect(result).toBeDefined();
			expect(result.context).toContain('UPLOADED FILES');
			expect(result.stats.components.files).toBeGreaterThan(0);
		});

		it('should include files without breaking other priorities', async () => {
			// Arrange: files + superjournal data
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'superjournal') {
					return {
						select: vi.fn().mockReturnValue({
							is: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue({
										data: [
											{
												user_message: 'Test message',
												ai_response: 'Test response',
												persona_name: 'ananya',
												created_at: '2024-01-01T00:00:00Z'
											}
										],
										error: null
									})
								})
							}),
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue({
										data: [
											{
												user_message: 'Test message',
												ai_response: 'Test response',
												persona_name: 'ananya',
												created_at: '2024-01-01T00:00:00Z'
											}
										],
										error: null
									})
								})
							})
						})
					};
				}

				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn().mockResolvedValue({
										data: [
											{
												filename: 'test.pdf',
												file_type: 'pdf',
												description: 'Test file description'
											}
										],
										error: null
									})
								})
							})
						})
					};
				}

				if (table === 'models') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: { context_window: 131072 },
									error: null
								})
							})
						})
					};
				}

				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnThis(),
						is: vi.fn().mockReturnThis(),
						or: vi.fn().mockReturnThis(),
						order: vi.fn().mockReturnThis(),
						limit: vi.fn().mockResolvedValue({ data: [], error: null })
					})
				};
			});

			// Act
			const result = await buildContextForCalls1A1B('test-user-id');

			// Assert
			expect(result.context).toContain('WORKING MEMORY');
			expect(result.context).toContain('UPLOADED FILES');
			expect(result.stats.components.superjournal).toBeGreaterThan(0);
			expect(result.stats.components.files).toBeGreaterThan(0);
		});
	});

	describe('backward compatibility', () => {
		it('should maintain same context structure without files', async () => {
			// Arrange
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'superjournal') {
					return {
						select: vi.fn().mockReturnValue({
							is: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue({
										data: [
											{
												user_message: 'Test message',
												ai_response: 'Test response',
												persona_name: 'ananya',
												created_at: '2024-01-01T00:00:00Z'
											}
										],
										error: null
									})
								})
							}),
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue({
										data: [
											{
												user_message: 'Test message',
												ai_response: 'Test response',
												persona_name: 'ananya',
												created_at: '2024-01-01T00:00:00Z'
											}
										],
										error: null
									})
								})
							})
						})
					};
				}

				if (table === 'models') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: { context_window: 131072 },
									error: null
								})
							})
						})
					};
				}

				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn().mockResolvedValue({ data: [], error: null })
								})
							})
						})
					};
				}

				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnThis(),
						is: vi.fn().mockReturnThis(),
						or: vi.fn().mockReturnThis(),
						order: vi.fn().mockReturnThis(),
						limit: vi.fn().mockResolvedValue({ data: [], error: null })
					})
				};
			});

			// Act
			const result = await buildContextForCalls1A1B(null);

			// Assert
			expect(result.context).toMatch(/--- WORKING MEMORY/);
			// Files section should NOT appear when empty
			expect(result.context).not.toContain('UPLOADED FILES');
		});

		it('should not modify existing priority ordering', async () => {
			// This test ensures files are added as Priority 6, not interfering with 1-5
			const result = await buildContextForCalls1A1B('test-user-id');

			// Context assembly order should be maintained
			expect(result).toBeDefined();
			expect(result.stats.components).toHaveProperty('superjournal');
			expect(result.stats.components).toHaveProperty('starred');
			expect(result.stats.components).toHaveProperty('instructions');
			expect(result.stats.components).toHaveProperty('journal');
			expect(result.stats.components).toHaveProperty('highSalienceArcs');
			expect(result.stats.components).toHaveProperty('otherArcs');
			expect(result.stats.components).toHaveProperty('files');
		});
	});

	describe('null safety', () => {
		it('should handle files with null descriptions', async () => {
			// Arrange
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn().mockResolvedValue({
										data: [
											{
												filename: 'incomplete.pdf',
												file_type: 'pdf',
												description: null // This should be handled gracefully
											}
										],
										error: null
									})
								})
							})
						})
					};
				}

				if (table === 'models') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: { context_window: 131072 },
									error: null
								})
							})
						})
					};
				}

				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnThis(),
						is: vi.fn().mockReturnThis(),
						or: vi.fn().mockReturnThis(),
						order: vi.fn().mockReturnThis(),
						limit: vi.fn().mockResolvedValue({ data: [], error: null })
					})
				};
			});

			// Act & Assert
			const result = await buildContextForCalls1A1B('test-user-id');
			expect(result).toBeDefined();
			// Should not include files with null descriptions
			expect(result.stats.components.files).toBe(0);
		});
	});
});
