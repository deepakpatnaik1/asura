/**
 * Unit Tests for file-compressor.ts
 *
 * Tests file compression with mocked Fireworks AI API.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CompressionInput, CompressionResult } from '$lib/file-compressor';

// Mock OpenAI using vi.hoisted() BEFORE imports
const mockFireworksClient = vi.hoisted(() => ({
	chat: {
		completions: {
			create: vi.fn()
		}
	}
}));

const MockOpenAI = vi.hoisted(() => {
	return class {
		chat = mockFireworksClient.chat;
	};
});

vi.mock('openai', () => ({
	default: MockOpenAI
}));

// NOW import the module that uses OpenAI
import { compressFile, FileCompressionError } from '$lib/file-compressor';

describe('file-compressor', () => {
	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('compressFile', () => {
		it('should compress file and return valid result', async () => {
			const call2aResponse = JSON.stringify({
				filename: 'test.txt',
				file_type: 'text',
				description: 'Compressed description from Call 2A'
			});

			const call2bResponse = JSON.stringify({
				filename: 'test.txt',
				file_type: 'text',
				description: 'Refined description from Call 2B'
			});

			mockFireworksClient.chat.completions.create
				.mockResolvedValueOnce({
					choices: [{ message: { content: call2aResponse } }]
				})
				.mockResolvedValueOnce({
					choices: [{ message: { content: call2bResponse } }]
				});

			const input: CompressionInput = {
				extractedText: 'This is a long document with lots of verbose content that needs compression.',
				filename: 'test.txt',
				fileType: 'text'
			};

			const result = await compressFile(input);

			expect(result.filename).toBe('test.txt');
			expect(result.fileType).toBe('text');
			expect(result.description).toBe('Refined description from Call 2B');
			expect(result.call2aResponse).toBeDefined();
			expect(result.call2bResponse).toBeDefined();
			expect(mockFireworksClient.chat.completions.create).toHaveBeenCalledTimes(2);
		});

		it('should handle markdown code blocks in response', async () => {
			const call2aResponse = '```json\n{"filename": "test.pdf", "file_type": "pdf", "description": "Test"}\n```';
			const call2bResponse = '```json\n{"filename": "test.pdf", "file_type": "pdf", "description": "Refined"}\n```';

			mockFireworksClient.chat.completions.create
				.mockResolvedValueOnce({
					choices: [{ message: { content: call2aResponse } }]
				})
				.mockResolvedValueOnce({
					choices: [{ message: { content: call2bResponse } }]
				});

			const input: CompressionInput = {
				extractedText: 'PDF content',
				filename: 'test.pdf',
				fileType: 'pdf'
			};

			const result = await compressFile(input);

			expect(result.description).toBe('Refined');
		});

		it('should handle thinking tags in response (Qwen3)', async () => {
			const call2aResponse =
				'<think>Let me analyze this...</think>\n{"filename": "test.txt", "file_type": "text", "description": "Analysis"}';
			const call2bResponse =
				'<think>Refining...</think>\n{"filename": "test.txt", "file_type": "text", "description": "Final"}';

			mockFireworksClient.chat.completions.create
				.mockResolvedValueOnce({
					choices: [{ message: { content: call2aResponse } }]
				})
				.mockResolvedValueOnce({
					choices: [{ message: { content: call2bResponse } }]
				});

			const input: CompressionInput = {
				extractedText: 'Content',
				filename: 'test.txt',
				fileType: 'text'
			};

			const result = await compressFile(input);

			expect(result.description).toBe('Final');
		});

		it('should extract JSON from mixed text response', async () => {
			const call2aResponse =
				'Here is the result:\n{"filename": "test.txt", "file_type": "text", "description": "Result"}\nThat is all.';
			const call2bResponse = 'Final output: {"filename": "test.txt", "file_type": "text", "description": "Final"}';

			mockFireworksClient.chat.completions.create
				.mockResolvedValueOnce({
					choices: [{ message: { content: call2aResponse } }]
				})
				.mockResolvedValueOnce({
					choices: [{ message: { content: call2bResponse } }]
				});

			const input: CompressionInput = {
				extractedText: 'Content',
				filename: 'test.txt',
				fileType: 'text'
			};

			const result = await compressFile(input);

			expect(result.description).toBe('Final');
		});

		it('should call Fireworks with correct prompts', async () => {
			mockFireworksClient.chat.completions.create.mockResolvedValue({
				choices: [
					{
						message: {
							content: JSON.stringify({
								filename: 'test.txt',
								file_type: 'text',
								description: 'Test'
							})
						}
					}
				]
			});

			const input: CompressionInput = {
				extractedText: 'Test content',
				filename: 'test.txt',
				fileType: 'text'
			};

			await compressFile(input);

			const calls = mockFireworksClient.chat.completions.create.mock.calls;

			// Call 2A
			expect(calls[0][0].messages[0].role).toBe('system');
			expect(calls[0][0].messages[0].content).toContain('ARTISAN CUT');
			expect(calls[0][0].messages[1].role).toBe('user');
			expect(calls[0][0].messages[1].content).toContain('test.txt');
			expect(calls[0][0].messages[1].content).toContain('Test content');

			// Call 2B
			expect(calls[1][0].messages[0].role).toBe('system');
			expect(calls[1][0].messages[0].content).toContain('Review the previous JSON');
			expect(calls[1][0].messages[1].role).toBe('user');
		});

		it('should use correct model and parameters', async () => {
			mockFireworksClient.chat.completions.create.mockResolvedValue({
				choices: [
					{
						message: {
							content: JSON.stringify({
								filename: 'test.txt',
								file_type: 'text',
								description: 'Test'
							})
						}
					}
				]
			});

			await compressFile({
				extractedText: 'Content',
				filename: 'test.txt',
				fileType: 'text'
			});

			const call = mockFireworksClient.chat.completions.create.mock.calls[0][0];

			expect(call.model).toBe('accounts/fireworks/models/qwen3-235b-a22b');
			expect(call.temperature).toBe(0.7);
			expect(call.max_tokens).toBe(2000);
		});

		it('should handle all file types', async () => {
			const fileTypes: Array<'pdf' | 'image' | 'text' | 'code' | 'spreadsheet' | 'other'> = [
				'pdf',
				'image',
				'text',
				'code',
				'spreadsheet',
				'other'
			];

			for (const fileType of fileTypes) {
				mockFireworksClient.chat.completions.create.mockResolvedValue({
					choices: [
						{
							message: {
								content: JSON.stringify({
									filename: 'test.file',
									file_type: fileType,
									description: `Description for ${fileType}`
								})
							}
						}
					]
				});

				const result = await compressFile({
					extractedText: 'Content',
					filename: 'test.file',
					fileType
				});

				expect(result.fileType).toBe(fileType);
			}
		});
	});

	describe('error handling', () => {
		it('should throw EMPTY_CONTENT for empty text', async () => {
			await expect(
				compressFile({
					extractedText: '',
					filename: 'test.txt',
					fileType: 'text'
				})
			).rejects.toThrow(FileCompressionError);

			try {
				await compressFile({
					extractedText: '',
					filename: 'test.txt',
					fileType: 'text'
				});
			} catch (error) {
				expect(error).toBeInstanceOf(FileCompressionError);
				expect((error as FileCompressionError).code).toBe('EMPTY_CONTENT');
			}
		});

		it('should throw EMPTY_CONTENT for whitespace-only text', async () => {
			await expect(
				compressFile({
					extractedText: '   \n\t  ',
					filename: 'test.txt',
					fileType: 'text'
				})
			).rejects.toThrow(FileCompressionError);

			try {
				await compressFile({
					extractedText: '   \n\t  ',
					filename: 'test.txt',
					fileType: 'text'
				});
			} catch (error) {
				expect((error as FileCompressionError).code).toBe('EMPTY_CONTENT');
			}
		});

		it('should throw VALIDATION_ERROR for content too long', async () => {
			const longText = 'a'.repeat(100001); // Exceeds MAX_CONTENT_LENGTH

			await expect(
				compressFile({
					extractedText: longText,
					filename: 'test.txt',
					fileType: 'text'
				})
			).rejects.toThrow(FileCompressionError);

			try {
				await compressFile({
					extractedText: longText,
					filename: 'test.txt',
					fileType: 'text'
				});
			} catch (error) {
				expect((error as FileCompressionError).code).toBe('VALIDATION_ERROR');
				expect((error as FileCompressionError).message).toContain('maximum length');
			}
		});

		it('should throw INVALID_FILE_TYPE for invalid file type', async () => {
			await expect(
				compressFile({
					extractedText: 'Content',
					filename: 'test.xyz',
					fileType: 'invalid' as any
				})
			).rejects.toThrow(FileCompressionError);

			try {
				await compressFile({
					extractedText: 'Content',
					filename: 'test.xyz',
					fileType: 'invalid' as any
				});
			} catch (error) {
				expect((error as FileCompressionError).code).toBe('INVALID_FILE_TYPE');
			}
		});

		it('should throw API_ERROR when API key is missing', async () => {
			// Save original API key
			const originalKey = process.env.FIREWORKS_API_KEY;

			try {
				// Temporarily remove API key
				delete process.env.FIREWORKS_API_KEY;

				await expect(
					compressFile({
						extractedText: 'Content',
						filename: 'test.txt',
						fileType: 'text'
					})
				).rejects.toThrow(FileCompressionError);

				try {
					await compressFile({
						extractedText: 'Content',
						filename: 'test.txt',
						fileType: 'text'
					});
				} catch (error) {
					expect((error as FileCompressionError).code).toBe('API_ERROR');
					expect((error as FileCompressionError).message).toContain('FIREWORKS_API_KEY');
				}
			} finally {
				// Restore original API key for other tests
				if (originalKey) {
					process.env.FIREWORKS_API_KEY = originalKey;
				}
			}
		});

		it('should throw RATE_LIMIT for 429 status', async () => {
			const rateLimitError: any = new Error('Rate limit exceeded');
			rateLimitError.status = 429;

			mockFireworksClient.chat.completions.create.mockRejectedValue(rateLimitError);

			await expect(
				compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				})
			).rejects.toThrow(FileCompressionError);

			try {
				await compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				});
			} catch (error) {
				expect((error as FileCompressionError).code).toBe('RATE_LIMIT');
			}
		});

		it('should throw API_ERROR for auth failures (401/403)', async () => {
			const authError: any = new Error('Unauthorized');
			authError.status = 401;

			mockFireworksClient.chat.completions.create.mockRejectedValue(authError);

			await expect(
				compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				})
			).rejects.toThrow(FileCompressionError);

			try {
				await compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				});
			} catch (error) {
				expect((error as FileCompressionError).code).toBe('API_ERROR');
				expect((error as FileCompressionError).message).toContain('authentication failed');
			}
		});

		it('should throw API_ERROR for generic API failures', async () => {
			mockFireworksClient.chat.completions.create.mockRejectedValue(new Error('Network error'));

			await expect(
				compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				})
			).rejects.toThrow(FileCompressionError);

			try {
				await compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				});
			} catch (error) {
				expect((error as FileCompressionError).code).toBe('API_ERROR');
			}
		});

		it('should throw JSON_PARSE_ERROR for invalid JSON response', async () => {
			mockFireworksClient.chat.completions.create.mockResolvedValue({
				choices: [{ message: { content: 'Not valid JSON' } }]
			});

			await expect(
				compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				})
			).rejects.toThrow(FileCompressionError);

			try {
				await compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				});
			} catch (error) {
				expect((error as FileCompressionError).code).toBe('JSON_PARSE_ERROR');
				expect((error as FileCompressionError).details).toHaveProperty('rawText');
			}
		});

		it('should throw VALIDATION_ERROR for missing required fields', async () => {
			mockFireworksClient.chat.completions.create.mockResolvedValue({
				choices: [
					{
						message: {
							content: JSON.stringify({
								filename: 'test.txt'
								// Missing file_type and description
							})
						}
					}
				]
			});

			await expect(
				compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				})
			).rejects.toThrow(FileCompressionError);

			try {
				await compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				});
			} catch (error) {
				expect((error as FileCompressionError).code).toBe('VALIDATION_ERROR');
				expect((error as FileCompressionError).message).toContain('missing required fields');
			}
		});

		it('should throw VALIDATION_ERROR for invalid file_type in response', async () => {
			mockFireworksClient.chat.completions.create.mockResolvedValue({
				choices: [
					{
						message: {
							content: JSON.stringify({
								filename: 'test.txt',
								file_type: 'invalid_type',
								description: 'Test'
							})
						}
					}
				]
			});

			await expect(
				compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				})
			).rejects.toThrow(FileCompressionError);

			try {
				await compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				});
			} catch (error) {
				expect((error as FileCompressionError).code).toBe('VALIDATION_ERROR');
				expect((error as FileCompressionError).message).toContain('Invalid file_type');
			}
		});

		it('should throw API_ERROR for empty response content', async () => {
			mockFireworksClient.chat.completions.create.mockResolvedValue({
				choices: [{ message: { content: null } }]
			});

			await expect(
				compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				})
			).rejects.toThrow(FileCompressionError);

			try {
				await compressFile({
					extractedText: 'Content',
					filename: 'test.txt',
					fileType: 'text'
				});
			} catch (error) {
				expect((error as FileCompressionError).code).toBe('API_ERROR');
				expect((error as FileCompressionError).message).toContain('empty response');
			}
		});
	});

	describe('FileCompressionError class', () => {
		it('should create error with all properties', () => {
			const error = new FileCompressionError('Test message', 'API_ERROR', { key: 'value' });

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(FileCompressionError);
			expect(error.name).toBe('FileCompressionError');
			expect(error.message).toBe('Test message');
			expect(error.code).toBe('API_ERROR');
			expect(error.details).toEqual({ key: 'value' });
		});

		it('should create error without details', () => {
			const error = new FileCompressionError('Test message', 'EMPTY_CONTENT');

			expect(error.message).toBe('Test message');
			expect(error.code).toBe('EMPTY_CONTENT');
			expect(error.details).toBeUndefined();
		});
	});
});
