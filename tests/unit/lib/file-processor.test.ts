/**
 * Unit Tests for file-processor.ts
 *
 * Tests the complete file processing pipeline with mocked dependencies.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ProcessFileInput, ProgressUpdate } from '$lib/file-processor';

// Mock all dependencies using vi.hoisted() - BEFORE any imports
const mockSupabase = vi.hoisted(() => ({
	from: vi.fn(() => ({
		select: vi.fn(() => ({
			eq: vi.fn(() => ({
				eq: vi.fn(() => ({
					limit: vi.fn().mockResolvedValue({ data: [], error: null })
				}))
			}))
		})),
		insert: vi.fn(() => ({
			select: vi.fn().mockResolvedValue({
				data: [{ id: 'test-file-id-123' }],
				error: null
			})
		})),
		update: vi.fn(() => ({
			eq: vi.fn().mockResolvedValue({ error: null })
		}))
	}))
}));

const mockExtractText = vi.hoisted(() => vi.fn());
const mockCompressFile = vi.hoisted(() => vi.fn());
const mockGenerateEmbedding = vi.hoisted(() => vi.fn());

// Define error classes that will be used in mocks
const MockFileExtractionError = vi.hoisted(() => {
	return class extends Error {
		constructor(message: string, public code: string, public details?: any) {
			super(message);
			this.name = 'FileExtractionError';
		}
	};
});

const MockFileCompressionError = vi.hoisted(() => {
	return class extends Error {
		constructor(message: string, public code: string, public details?: any) {
			super(message);
			this.name = 'FileCompressionError';
		}
	};
});

const MockVectorizationError = vi.hoisted(() => {
	return class extends Error {
		constructor(message: string, public code: string, public details?: any) {
			super(message);
			this.name = 'VectorizationError';
		}
	};
});

vi.mock('$lib/supabase', () => ({
	supabase: mockSupabase
}));

vi.mock('$lib/file-extraction', () => ({
	extractText: mockExtractText,
	validateFileSize: vi.fn(),
	generateContentHash: vi.fn(),
	FileExtractionError: MockFileExtractionError
}));

vi.mock('$lib/file-compressor', () => ({
	compressFile: mockCompressFile,
	FileCompressionError: MockFileCompressionError
}));

vi.mock('$lib/vectorization', () => ({
	generateEmbedding: mockGenerateEmbedding,
	VectorizationError: MockVectorizationError
}));

// NOW import the module
import { processFile, FileProcessorError } from '$lib/file-processor';

describe('file-processor', () => {
	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Set up default successful responses
		mockExtractText.mockResolvedValue({
			text: 'Extracted text content',
			fileType: 'text',
			contentHash: 'abc123hash',
			fileSizeBytes: 1024,
			wordCount: 3,
			charCount: 22,
			filename: 'test.txt',
			extension: 'txt',
			success: true
		});

		mockCompressFile.mockResolvedValue({
			filename: 'test.txt',
			fileType: 'text',
			description: 'Compressed description',
			call2aResponse: {},
			call2bResponse: {}
		});

		mockGenerateEmbedding.mockResolvedValue(
			Array.from({ length: 1024 }, (_, i) => Math.sin(i / 100))
		);

		// Mock Supabase insert to return file ID
		mockSupabase.from.mockReturnValue({
			insert: vi.fn().mockReturnValue({
				select: vi.fn().mockResolvedValue({
					data: [{ id: 'test-file-id-123' }],
					error: null
				})
			}),
			update: vi.fn().mockReturnValue({
				eq: vi.fn().mockResolvedValue({ error: null })
			}),
			select: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue({ data: [], error: null })
					})
				})
			})
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('processFile - happy path', () => {
		it('should process file successfully through complete pipeline', async () => {
			const input: ProcessFileInput = {
				fileBuffer: Buffer.from('test content'),
				filename: 'test.txt',
				userId: '123e4567-e89b-12d3-a456-426614174000',
				contentType: 'text/plain'
			};

			const result = await processFile(input);

			expect(result.id).toBe('test-file-id-123');
			expect(result.filename).toBe('test.txt');
			expect(result.fileType).toBe('text');
			expect(result.status).toBe('ready');
			expect(result.error).toBeUndefined();

			// Verify all stages were called
			expect(mockExtractText).toHaveBeenCalledWith(input.fileBuffer, input.filename);
			expect(mockCompressFile).toHaveBeenCalledWith({
				extractedText: 'Extracted text content',
				filename: 'test.txt',
				fileType: 'text'
			});
			expect(mockGenerateEmbedding).toHaveBeenCalledWith('Compressed description');
		});

		it('should call progress callback at each stage', async () => {
			const progressUpdates: ProgressUpdate[] = [];
			const onProgress = vi.fn((update: ProgressUpdate) => {
				progressUpdates.push(update);
			});

			const input: ProcessFileInput = {
				fileBuffer: Buffer.from('test content'),
				filename: 'test.txt',
				userId: '123e4567-e89b-12d3-a456-426614174000',
				contentType: 'text/plain'
			};

			await processFile(input, { onProgress });

			expect(onProgress).toHaveBeenCalled();
			expect(progressUpdates.length).toBeGreaterThan(0);

			// Verify progress values increase
			const progressValues = progressUpdates.map((u) => u.progress);
			expect(progressValues[0]).toBe(0);
			expect(progressValues[progressValues.length - 1]).toBe(100);

			// Verify stages are present
			const stages = progressUpdates.map((u) => u.stage);
			expect(stages).toContain('extraction');
			expect(stages).toContain('compression');
			expect(stages).toContain('embedding');
			expect(stages).toContain('finalization');
		});

		it('should support async progress callbacks', async () => {
			const onProgress = vi.fn(async (update: ProgressUpdate) => {
				await new Promise((resolve) => setTimeout(resolve, 10));
			});

			const input: ProcessFileInput = {
				fileBuffer: Buffer.from('test content'),
				filename: 'test.txt',
				userId: '123e4567-e89b-12d3-a456-426614174000',
				contentType: 'text/plain'
			};

			await processFile(input, { onProgress });

			expect(onProgress).toHaveBeenCalled();
		});

		it('should create database record with correct fields', async () => {
			const input: ProcessFileInput = {
				fileBuffer: Buffer.from('test content'),
				filename: 'document.pdf',
				userId: '123e4567-e89b-12d3-a456-426614174000',
				contentType: 'application/pdf'
			};

			mockExtractText.mockResolvedValue({
				text: 'PDF content',
				fileType: 'pdf',
				contentHash: 'pdfhash123',
				fileSizeBytes: 2048,
				wordCount: 100,
				charCount: 500,
				filename: 'document.pdf',
				extension: 'pdf',
				success: true
			});

			await processFile(input);

			// Verify insert was called with correct data
			const insertCall = mockSupabase.from().insert.mock.calls[0][0][0];
			expect(insertCall.user_id).toBe('123e4567-e89b-12d3-a456-426614174000');
			expect(insertCall.filename).toBe('document.pdf');
			expect(insertCall.file_type).toBe('pdf');
			expect(insertCall.content_hash).toBe('pdfhash123');
			expect(insertCall.status).toBe('pending');
			expect(insertCall.progress).toBe(0);
		});

		it('should update database with final results', async () => {
			const input: ProcessFileInput = {
				fileBuffer: Buffer.from('test content'),
				filename: 'test.txt',
				userId: '123e4567-e89b-12d3-a456-426614174000',
				contentType: 'text/plain'
			};

			await processFile(input);

			// Find the final update call (status=ready)
			const updateCalls = mockSupabase.from().update.mock.calls;
			const finalUpdate = updateCalls.find((call: any) => call[0].status === 'ready');

			expect(finalUpdate).toBeDefined();
			expect(finalUpdate[0].status).toBe('ready');
			expect(finalUpdate[0].description).toBe('Compressed description');
			expect(finalUpdate[0].embedding).toHaveLength(1024);
			expect(finalUpdate[0].progress).toBe(100);
		});
	});

	describe('duplicate detection', () => {
		it('should detect duplicate files for same user', async () => {
			// Mock duplicate found
			mockSupabase.from.mockReturnValue({
				insert: vi.fn().mockReturnValue({
					select: vi.fn().mockResolvedValue({
						data: [{ id: 'test-file-id-123' }],
						error: null
					})
				}),
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue({
								data: [{ id: 'existing-file-id' }],
								error: null
							})
						})
					})
				}),
				update: vi.fn().mockReturnValue({
					eq: vi.fn().mockResolvedValue({ error: null })
				})
			});

			const input: ProcessFileInput = {
				fileBuffer: Buffer.from('duplicate content'),
				filename: 'duplicate.txt',
				userId: '123e4567-e89b-12d3-a456-426614174000',
				contentType: 'text/plain'
			};

			await expect(processFile(input)).rejects.toThrow(FileProcessorError);

			try {
				await processFile(input);
			} catch (error) {
				expect(error).toBeInstanceOf(FileProcessorError);
				expect((error as FileProcessorError).code).toBe('DUPLICATE_FILE');
				expect((error as FileProcessorError).message).toContain('already exists');
			}
		});

		it('should skip duplicate check when option is set', async () => {
			// Mock would indicate duplicate, but should be skipped
			mockSupabase.from.mockReturnValue({
				insert: vi.fn().mockReturnValue({
					select: vi.fn().mockResolvedValue({
						data: [{ id: 'test-file-id-123' }],
						error: null
					})
				}),
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue({
								data: [{ id: 'existing-file-id' }],
								error: null
							})
						})
					})
				}),
				update: vi.fn().mockReturnValue({
					eq: vi.fn().mockResolvedValue({ error: null })
				})
			});

			const input: ProcessFileInput = {
				fileBuffer: Buffer.from('content'),
				filename: 'test.txt',
				userId: '123e4567-e89b-12d3-a456-426614174000',
				contentType: 'text/plain'
			};

			const result = await processFile(input, { skipDuplicateCheck: true });

			expect(result.status).toBe('ready');
		});
	});

	describe('error handling - extraction stage', () => {
		it('should handle extraction error gracefully', async () => {
			mockExtractText.mockRejectedValue(
				new (MockFileExtractionError as any)('PDF parse failed', 'PDF_PARSE_ERROR')
			);

			const input: ProcessFileInput = {
				fileBuffer: Buffer.from('content'),
				filename: 'test.pdf',
				userId: '123e4567-e89b-12d3-a456-426614174000',
				contentType: 'application/pdf'
			};

			await expect(processFile(input)).rejects.toThrow(FileProcessorError);

			try {
				await processFile(input);
			} catch (error) {
				expect(error).toBeInstanceOf(FileProcessorError);
				expect((error as FileProcessorError).code).toBe('EXTRACTION_ERROR');
				expect((error as FileProcessorError).stage).toBe('extraction');
			}
		});
	});

	describe('error handling - compression stage', () => {
		it('should handle compression error and mark file as failed', async () => {
			mockCompressFile.mockRejectedValue(
				new (MockFileCompressionError as any)('API error', 'API_ERROR')
			);

			const input: ProcessFileInput = {
				fileBuffer: Buffer.from('content'),
				filename: 'test.txt',
				userId: '123e4567-e89b-12d3-a456-426614174000',
				contentType: 'text/plain'
			};

			const result = await processFile(input);

			expect(result.status).toBe('failed');
			expect(result.error).toBeDefined();
			expect(result.error?.code).toBe('COMPRESSION_ERROR');
			expect(result.error?.stage).toBe('compression');

			// Verify database was updated with error
			const updateCalls = mockSupabase.from().update.mock.calls;
			const errorUpdate = updateCalls.find((call: any) => call[0].status === 'failed');
			expect(errorUpdate).toBeDefined();
		});
	});

	describe('error handling - embedding stage', () => {
		it('should handle embedding error and mark file as failed', async () => {
			mockGenerateEmbedding.mockRejectedValue(
				new (MockVectorizationError as any)('Rate limit exceeded', 'API_RATE_LIMIT')
			);

			const input: ProcessFileInput = {
				fileBuffer: Buffer.from('content'),
				filename: 'test.txt',
				userId: '123e4567-e89b-12d3-a456-426614174000',
				contentType: 'text/plain'
			};

			const result = await processFile(input);

			expect(result.status).toBe('failed');
			expect(result.error).toBeDefined();
			expect(result.error?.code).toBe('EMBEDDING_ERROR');
			expect(result.error?.stage).toBe('embedding');
		});
	});

	describe('validation', () => {
		it('should throw VALIDATION_ERROR for invalid buffer', async () => {
			const input = {
				fileBuffer: null as any,
				filename: 'test.txt',
				userId: '123e4567-e89b-12d3-a456-426614174000',
				contentType: 'text/plain'
			};

			await expect(processFile(input)).rejects.toThrow(FileProcessorError);

			try {
				await processFile(input);
			} catch (error) {
				expect((error as FileProcessorError).code).toBe('VALIDATION_ERROR');
				expect((error as FileProcessorError).message).toContain('Invalid file buffer');
			}
		});

		it('should throw VALIDATION_ERROR for empty filename', async () => {
			const input: ProcessFileInput = {
				fileBuffer: Buffer.from('content'),
				filename: '',
				userId: '123e4567-e89b-12d3-a456-426614174000',
				contentType: 'text/plain'
			};

			await expect(processFile(input)).rejects.toThrow(FileProcessorError);

			try {
				await processFile(input);
			} catch (error) {
				expect((error as FileProcessorError).code).toBe('VALIDATION_ERROR');
				expect((error as FileProcessorError).message).toContain('Filename is required');
			}
		});

		it('should throw VALIDATION_ERROR for invalid userId format', async () => {
			const input: ProcessFileInput = {
				fileBuffer: Buffer.from('content'),
				filename: 'test.txt',
				userId: 'not-a-uuid',
				contentType: 'text/plain'
			};

			await expect(processFile(input)).rejects.toThrow(FileProcessorError);

			try {
				await processFile(input);
			} catch (error) {
				expect((error as FileProcessorError).code).toBe('VALIDATION_ERROR');
				expect((error as FileProcessorError).message).toContain('valid UUID');
			}
		});

		it('should throw VALIDATION_ERROR for missing contentType', async () => {
			const input = {
				fileBuffer: Buffer.from('content'),
				filename: 'test.txt',
				userId: '123e4567-e89b-12d3-a456-426614174000',
				contentType: null as any
			};

			await expect(processFile(input)).rejects.toThrow(FileProcessorError);

			try {
				await processFile(input);
			} catch (error) {
				expect((error as FileProcessorError).code).toBe('VALIDATION_ERROR');
				expect((error as FileProcessorError).message).toContain('Content type is required');
			}
		});

		it('should accept valid UUID v4', async () => {
			const validUUIDs = [
				'123e4567-e89b-12d3-a456-426614174000',
				'550e8400-e29b-41d4-a716-446655440000',
				'f47ac10b-58cc-4372-a567-0e02b2c3d479'
			];

			for (const uuid of validUUIDs) {
				const input: ProcessFileInput = {
					fileBuffer: Buffer.from('content'),
					filename: 'test.txt',
					userId: uuid,
					contentType: 'text/plain'
				};

				const result = await processFile(input);
				expect(result.status).toBe('ready');
			}
		});
	});

	describe('FileProcessorError class', () => {
		it('should create error with all properties', () => {
			const error = new FileProcessorError(
				'Test message',
				'EXTRACTION_ERROR',
				'extraction',
				{ key: 'value' }
			);

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(FileProcessorError);
			expect(error.name).toBe('FileProcessorError');
			expect(error.message).toBe('Test message');
			expect(error.code).toBe('EXTRACTION_ERROR');
			expect(error.stage).toBe('extraction');
			expect(error.details).toEqual({ key: 'value' });
		});

		it('should create error without details', () => {
			const error = new FileProcessorError('Test', 'DATABASE_ERROR', 'finalization');

			expect(error.message).toBe('Test');
			expect(error.code).toBe('DATABASE_ERROR');
			expect(error.stage).toBe('finalization');
			expect(error.details).toBeUndefined();
		});
	});
});
