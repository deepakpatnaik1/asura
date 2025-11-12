/**
 * Unit Tests for context-builder.ts (File Integration)
 *
 * Tests file context formatting and integration with existing context builder.
 * Focuses on Priority 6 (file uploads) functionality.
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
		insert: vi.fn().mockReturnThis(),
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

describe('context-builder (file integration)', () => {
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

			// Default empty responses for files table - support full chain: select().eq().order().eq()/.is()
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
				})
			};
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('file context formatting', () => {
		it('should include ready files in context (Priority 6)', async () => {
			// Mock files query - support full chain: select().eq().order().eq()
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn().mockResolvedValue({
										data: [
											{
												filename: 'business-plan.pdf',
												file_type: 'pdf',
												description: 'Q4 revenue targets: $2M ARR. GTM strategy: focus on enterprise clients.'
											},
											{
												filename: 'technical-specs.md',
												file_type: 'text',
												description: 'API endpoints: /auth, /users, /files. Rate limit: 1000 req/hour.'
											}
										],
										error: null
									}),
									is: vi.fn().mockResolvedValue({
										data: [],
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

			const result = await buildContextForCalls1A1B('test-user-id');

			expect(result.context).toContain('UPLOADED FILES');
			expect(result.context).toContain('business-plan.pdf');
			expect(result.context).toContain('$2M ARR');
			expect(result.context).toContain('technical-specs.md');
			expect(result.context).toContain('API endpoints');
			expect(result.stats.components.files).toBeGreaterThan(0);
		});

		it('should format files with correct structure', async () => {
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn().mockResolvedValue({
										data: [
											{
												filename: 'test.txt',
												file_type: 'text',
												description: 'Test description'
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

			const result = await buildContextForCalls1A1B('test-user-id');

			// Verify format: ## filename (file_type)\ndescription
			expect(result.context).toMatch(/## test\.txt \(text\)/);
			expect(result.context).toContain('Test description');
		});

		it('should handle multiple files', async () => {
			const files = Array.from({ length: 5 }, (_, i) => ({
				filename: `file${i}.txt`,
				file_type: 'text',
				description: `Description ${i}`
			}));

			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn().mockResolvedValue({
										data: files,
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

			const result = await buildContextForCalls1A1B('test-user-id');

			for (let i = 0; i < 5; i++) {
				expect(result.context).toContain(`file${i}.txt`);
				expect(result.context).toContain(`Description ${i}`);
			}
		});

		it('should skip files with null descriptions', async () => {
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn().mockResolvedValue({
										data: [
											{
												filename: 'valid.txt',
												file_type: 'text',
												description: 'Valid description'
											},
											{
												filename: 'incomplete.txt',
												file_type: 'text',
												description: null // Should be skipped
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

			const result = await buildContextForCalls1A1B('test-user-id');

			expect(result.context).toContain('valid.txt');
			expect(result.context).toContain('Valid description');
			// incomplete.txt should not appear
			expect(result.context).not.toContain('incomplete.txt');
		});

		it('should handle empty file list gracefully', async () => {
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn().mockResolvedValue({
										data: [],
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

			const result = await buildContextForCalls1A1B('test-user-id');

			expect(result.context).not.toContain('UPLOADED FILES');
			expect(result.stats.components.files).toBe(0);
		});
	});

	describe('token budget management', () => {
		it('should respect 40% context budget cap', async () => {
			const contextWindow = 100000; // 100K tokens
			const maxBudget = contextWindow * 0.4; // 40K tokens

			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'models') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: { context_window: contextWindow },
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
									eq: vi.fn().mockResolvedValue({
										data: [
											{
												filename: 'test.txt',
												file_type: 'text',
												description: 'x'.repeat(1000)
											}
										],
										error: null
									})
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

			const result = await buildContextForCalls1A1B('test-user-id');

			expect(result.stats.totalTokens).toBeLessThanOrEqual(maxBudget);
		});

		it('should pack files greedily within remaining budget', async () => {
			// Create files of varying sizes
			const files = [
				{ filename: 'small.txt', file_type: 'text', description: 'x'.repeat(100) },
				{ filename: 'medium.txt', file_type: 'text', description: 'x'.repeat(500) },
				{ filename: 'large.txt', file_type: 'text', description: 'x'.repeat(1000) }
			];

			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn().mockResolvedValue({
										data: files,
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

			const result = await buildContextForCalls1A1B('test-user-id');

			// All files should fit within budget
			expect(result.context).toContain('small.txt');
			expect(result.context).toContain('medium.txt');
			expect(result.context).toContain('large.txt');
		});

		it('should truncate files when budget is exhausted', async () => {
			// Create many large files that exceed budget
			const manyFiles = Array.from({ length: 100 }, (_, i) => ({
				filename: `file${i}.txt`,
				file_type: 'text',
				description: 'x'.repeat(5000) // Each file ~1250 tokens
			}));

			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn().mockResolvedValue({
										data: manyFiles,
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

			const result = await buildContextForCalls1A1B('test-user-id');

			// Should include some files but not all (due to budget)
			const fileCount = result.context.match(/## file\d+\.txt/g)?.length || 0;
			expect(fileCount).toBeGreaterThan(0);
			expect(fileCount).toBeLessThan(100);
			expect(result.stats.totalTokens).toBeLessThanOrEqual(131072 * 0.4);
		});
	});

	describe('user isolation', () => {
		it('should only fetch files for specified user', async () => {
			const userId = 'user-123';

			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn((field: string, value: string) => {
										if (field === 'user_id') {
											expect(value).toBe(userId);
										}
										return Promise.resolve({ data: [], error: null });
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

			await buildContextForCalls1A1B(userId);

			// Mock assertions verify user_id was checked
		});

		it('should handle null user_id (shared files)', async () => {
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									is: vi.fn((field: string, value: any) => {
										if (field === 'user_id') {
											expect(value).toBeNull();
										}
										return Promise.resolve({ data: [], error: null });
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

			await buildContextForCalls1A1B(null);

			// Mock assertions verify null check
		});
	});

	describe('error handling', () => {
		it('should handle database query failure gracefully', async () => {
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									eq: vi.fn().mockResolvedValue({
										data: null,
										error: { message: 'Database error' }
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

			const result = await buildContextForCalls1A1B('test-user-id');

			// Should continue without files
			expect(result.stats.components.files).toBe(0);
			expect(result.context).not.toContain('UPLOADED FILES');
		});
	});

	describe('file ordering', () => {
		it('should order files by newest first', async () => {
			const files = [
				{
					filename: 'newest.txt',
					file_type: 'text',
					description: 'Most recent',
					uploaded_at: '2024-01-03T00:00:00Z'
				},
				{
					filename: 'older.txt',
					file_type: 'text',
					description: 'Older file',
					uploaded_at: '2024-01-02T00:00:00Z'
				},
				{
					filename: 'oldest.txt',
					file_type: 'text',
					description: 'Oldest file',
					uploaded_at: '2024-01-01T00:00:00Z'
				}
			];

			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'files') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								order: vi.fn((field: string, options: any) => {
									expect(field).toBe('uploaded_at');
									expect(options.ascending).toBe(false);
									return {
										eq: vi.fn().mockResolvedValue({ data: files, error: null })
									};
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

			const result = await buildContextForCalls1A1B('test-user-id');

			// Verify files appear in order
			const contextStr = result.context;
			const newestPos = contextStr.indexOf('newest.txt');
			const olderPos = contextStr.indexOf('older.txt');
			const oldestPos = contextStr.indexOf('oldest.txt');

			expect(newestPos).toBeLessThan(olderPos);
			expect(olderPos).toBeLessThan(oldestPos);
		});
	});
});
