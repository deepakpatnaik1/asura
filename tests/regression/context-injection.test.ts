/**
 * Regression Tests: Context Injection
 *
 * Ensures that file upload feature integrates correctly with context building:
 * - All priorities (1-6) work together
 * - 40% token budget still enforced
 * - Greedy packing works with mixed content
 * - Files don't override higher priorities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Supabase using vi.hoisted()
const mockSupabase = vi.hoisted(() => ({
	from: vi.fn(),
	storage: {
		from: vi.fn(() => ({
			upload: vi.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null })
		}))
	},
	rpc: vi.fn()
}));

vi.mock('$lib/supabase', () => ({
	supabase: mockSupabase
}));

// Mock Voyage AI
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

import { buildContextForCalls1A1B } from '$lib/context-builder';

describe('Regression: Context Injection', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Default empty implementation
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

	describe('priority ordering', () => {
		it('should load priorities 1-5 without files (baseline)', async () => {
			// Arrange: mock data for priorities 1-4
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'superjournal') {
					return {
						select: vi.fn().mockReturnValue({
							is: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue({
										data: [
											{
												user_message: 'Test',
												ai_response: 'Response',
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
										data: [],
										error: null
									})
								})
							})
						})
					};
				}

				if (table === 'journal') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								or: vi.fn().mockReturnValue({
									order: vi.fn().mockResolvedValue({
										data: [
											{
												boss_essence: 'Boss test',
												persona_essence: 'Persona test',
												decision_arc_summary: 'Test arc',
												persona_name: 'ananya',
												created_at: '2024-01-01T00:00:00Z'
											}
										],
										error: null
									})
								}),
								order: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue({
										data: [],
										error: null
									})
								})
							}),
							is: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue({
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
			expect(result.stats.components.superjournal).toBeGreaterThan(0);
			expect(result.stats.components.instructions).toBeGreaterThan(0);
			expect(result.stats.components.files).toBe(0); // No files
		});

		it('should load files at Priority 6 (after priorities 1-5)', async () => {
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
												filename: 'priority-test.pdf',
												file_type: 'pdf',
												description: 'Test file at Priority 6'
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
			expect(result.context).toContain('UPLOADED FILES');
			expect(result.stats.components.files).toBeGreaterThan(0);
		});
	});

	describe('token budget enforcement', () => {
		it('should respect 40% context budget cap', async () => {
			// Arrange: 100K context window
			const contextWindow = 100000;
			const maxBudget = contextWindow * 0.4;

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
												filename: 'large-file.pdf',
												file_type: 'pdf',
												description: 'x'.repeat(5000) // ~1250 tokens
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

			// Act
			const result = await buildContextForCalls1A1B('test-user-id');

			// Assert
			expect(result.stats.totalTokens).toBeLessThanOrEqual(maxBudget);
		});

		it('should pack files greedily within remaining budget', async () => {
			// Arrange: small files that should all fit
			const files = [
				{ filename: 'small1.txt', file_type: 'text', description: 'x'.repeat(100) },
				{ filename: 'small2.txt', file_type: 'text', description: 'x'.repeat(100) },
				{ filename: 'small3.txt', file_type: 'text', description: 'x'.repeat(100) }
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

			// Act
			const result = await buildContextForCalls1A1B('test-user-id');

			// Assert: all small files should fit
			expect(result.context).toContain('small1.txt');
			expect(result.context).toContain('small2.txt');
			expect(result.context).toContain('small3.txt');
		});

		it('should exclude files when budget exhausted', async () => {
			// Arrange: many large files that exceed budget
			const manyFiles = Array.from({ length: 50 }, (_, i) => ({
				filename: `file${i}.pdf`,
				file_type: 'pdf',
				description: 'x'.repeat(5000) // Each ~1250 tokens
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

			// Act
			const result = await buildContextForCalls1A1B('test-user-id');

			// Assert: should include some but not all files
			const fileCount = result.context.match(/## file\d+\.pdf/g)?.length || 0;
			expect(fileCount).toBeGreaterThan(0);
			expect(fileCount).toBeLessThan(50);
			expect(result.stats.totalTokens).toBeLessThanOrEqual(131072 * 0.4);
		});
	});

	describe('mixed content scenarios', () => {
		it('should handle context with all priorities populated', async () => {
			// Arrange: mock all tables with data
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'superjournal') {
					return {
						select: vi.fn().mockReturnValue({
							is: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue({
										data: [
											{
												user_message: 'Test superjournal',
												ai_response: 'Response',
												persona_name: 'ananya',
												created_at: '2024-01-01T00:00:00Z'
											}
										],
										error: null
									})
								})
							}),
							eq: vi.fn().mockReturnValue({
								eq: vi.fn().mockReturnValue({
									order: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue({
											data: [
												{
													user_message: 'Starred message',
													ai_response: 'Starred response',
													persona_name: 'ananya',
													created_at: '2024-01-01T00:00:00Z'
												}
											],
											error: null
										})
									})
								}),
								order: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue({
										data: [],
										error: null
									})
								})
							})
						})
					};
				}

				if (table === 'journal') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								or: vi.fn().mockReturnValue({
									order: vi.fn().mockResolvedValue({
										data: [
											{
												boss_essence: 'Instruction test',
												persona_essence: 'Instruction response',
												decision_arc_summary: 'Instruction arc',
												persona_name: 'ananya',
												created_at: '2024-01-01T00:00:00Z'
											}
										],
										error: null
									})
								}),
								order: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue({
										data: [
											{
												boss_essence: 'Journal test',
												persona_essence: 'Journal response',
												decision_arc_summary: 'Journal arc',
												persona_name: 'ananya',
												created_at: '2024-01-01T00:00:00Z'
											}
										],
										error: null
									})
								})
							}),
							is: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue({
										data: [],
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
												filename: 'mixed-content.pdf',
												file_type: 'pdf',
												description: 'File in mixed context'
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
			const result = await buildContextForCalls1A1B(null);

			// Assert: all sections should appear
			expect(result.context).toContain('WORKING MEMORY');
			expect(result.context).toContain('STARRED MESSAGES');
			expect(result.context).toContain('BEHAVIORAL INSTRUCTIONS');
			expect(result.context).toContain('RECENT MEMORY');
			expect(result.context).toContain('UPLOADED FILES');
		});

		it('should maintain correct section ordering in final context', async () => {
			// Arrange: files + other content
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'superjournal') {
					return {
						select: vi.fn().mockReturnValue({
							is: vi.fn().mockReturnValue({
								order: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue({
										data: [
											{
												user_message: 'Order test',
												ai_response: 'Response',
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
										data: [],
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
												filename: 'order-test.pdf',
												file_type: 'pdf',
												description: 'File should appear last'
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
			const result = await buildContextForCalls1A1B(null);

			// Assert: Working Memory should appear before Files
			const workingMemoryPos = result.context.indexOf('WORKING MEMORY');
			const filesPos = result.context.indexOf('UPLOADED FILES');
			expect(workingMemoryPos).toBeLessThan(filesPos);
		});
	});

	describe('file formatting', () => {
		it('should format files with correct structure', async () => {
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
												filename: 'format-test.md',
												file_type: 'text',
												description: 'Test file formatting'
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

			// Assert: check format "## filename (type)\ndescription"
			expect(result.context).toMatch(/## format-test\.md \(text\)/);
			expect(result.context).toContain('Test file formatting');
		});
	});
});
