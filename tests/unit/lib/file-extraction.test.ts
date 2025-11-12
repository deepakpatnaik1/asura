/**
 * Unit Tests for file-extraction.ts
 *
 * Tests all file extraction functions in isolation with mocked dependencies.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	extractText,
	validateFileSize,
	generateContentHash,
	FileExtractionError,
	type ExtractionResult,
	type FileType
} from '../../../src/lib/file-extraction';

describe('file-extraction', () => {
	describe('validateFileSize', () => {
		it('should pass for valid file size', () => {
			const buffer = Buffer.from('test content');
			expect(() => validateFileSize(buffer, 10)).not.toThrow();
		});

		it('should throw EMPTY_FILE for empty buffer', () => {
			const buffer = Buffer.alloc(0);
			expect(() => validateFileSize(buffer, 10)).toThrow(FileExtractionError);
			expect(() => validateFileSize(buffer, 10)).toThrow('File is empty (0 bytes)');

			try {
				validateFileSize(buffer, 10);
			} catch (error) {
				expect(error).toBeInstanceOf(FileExtractionError);
				expect((error as FileExtractionError).code).toBe('EMPTY_FILE');
			}
		});

		it('should throw FILE_TOO_LARGE for oversized file', () => {
			const buffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB
			expect(() => validateFileSize(buffer, 10)).toThrow(FileExtractionError);
			expect(() => validateFileSize(buffer, 10)).toThrow('exceeds limit');

			try {
				validateFileSize(buffer, 10);
			} catch (error) {
				expect(error).toBeInstanceOf(FileExtractionError);
				expect((error as FileExtractionError).code).toBe('FILE_TOO_LARGE');
				expect((error as FileExtractionError).details).toHaveProperty('fileSizeBytes');
				expect((error as FileExtractionError).details).toHaveProperty('maxSizeBytes');
			}
		});

		it('should accept file at exact size limit', () => {
			const buffer = Buffer.alloc(10 * 1024 * 1024); // Exactly 10 MB
			expect(() => validateFileSize(buffer, 10)).not.toThrow();
		});
	});

	describe('generateContentHash', () => {
		it('should generate SHA-256 hash', async () => {
			const buffer = Buffer.from('test content');
			const hash = await generateContentHash(buffer);

			expect(hash).toBeTruthy();
			expect(typeof hash).toBe('string');
			expect(hash).toHaveLength(64); // SHA-256 = 64 hex chars
			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});

		it('should generate consistent hashes for same content', async () => {
			const buffer = Buffer.from('identical content');
			const hash1 = await generateContentHash(buffer);
			const hash2 = await generateContentHash(buffer);

			expect(hash1).toBe(hash2);
		});

		it('should generate different hashes for different content', async () => {
			const buffer1 = Buffer.from('content A');
			const buffer2 = Buffer.from('content B');
			const hash1 = await generateContentHash(buffer1);
			const hash2 = await generateContentHash(buffer2);

			expect(hash1).not.toBe(hash2);
		});

		it('should handle empty buffer', async () => {
			const buffer = Buffer.alloc(0);
			const hash = await generateContentHash(buffer);

			expect(hash).toBeTruthy();
			expect(hash).toHaveLength(64);
		});

		it('should handle large buffers', async () => {
			const buffer = Buffer.alloc(1024 * 1024); // 1 MB
			const hash = await generateContentHash(buffer);

			expect(hash).toBeTruthy();
			expect(hash).toHaveLength(64);
		});
	});

	describe('extractText', () => {
		describe('text files', () => {
			it('should extract text from .txt file', async () => {
				const content = 'Hello, world! This is a test.';
				const buffer = Buffer.from(content, 'utf-8');
				const result = await extractText(buffer, 'test.txt');

				expect(result.text).toBe(content);
				expect(result.fileType).toBe('text');
				expect(result.filename).toBe('test.txt');
				expect(result.extension).toBe('txt');
				expect(result.success).toBe(true);
				expect(result.wordCount).toBe(6);
				expect(result.charCount).toBe(content.length);
				expect(result.contentHash).toBeTruthy();
				expect(result.fileSizeBytes).toBe(buffer.length);
			});

			it('should extract text from .md file', async () => {
				const content = '# Heading\n\nParagraph text.';
				const buffer = Buffer.from(content, 'utf-8');
				const result = await extractText(buffer, 'README.md');

				expect(result.text).toBe(content);
				expect(result.fileType).toBe('text');
				expect(result.extension).toBe('md');
			});

			it('should handle empty text file with warning', async () => {
				const buffer = Buffer.from('   ', 'utf-8'); // Non-empty buffer to avoid EMPTY_FILE error
				const result = await extractText(buffer, 'empty.txt');

				expect(result.text).toBeTruthy();
				expect(result.wordCount).toBe(0);
				expect(result.warnings).toBeDefined();
				expect(result.warnings![0]).toContain('Extracted text is empty');
			});

			it('should handle text file with only whitespace', async () => {
				const buffer = Buffer.from('   \n\n\t  ', 'utf-8');
				const result = await extractText(buffer, 'whitespace.txt');

				expect(result.text).toBeTruthy();
				expect(result.wordCount).toBe(0);
				expect(result.warnings).toBeDefined();
				expect(result.warnings![0]).toContain('Extracted text is empty');
			});
		});

		describe('code files', () => {
			it('should extract text from .js file', async () => {
				const code = 'function hello() { return "world"; }';
				const buffer = Buffer.from(code, 'utf-8');
				const result = await extractText(buffer, 'script.js');

				expect(result.text).toBe(code);
				expect(result.fileType).toBe('code');
				expect(result.extension).toBe('js');
			});

			it('should extract text from .ts file', async () => {
				const code = 'const x: number = 42;';
				const buffer = Buffer.from(code, 'utf-8');
				const result = await extractText(buffer, 'index.ts');

				expect(result.text).toBe(code);
				expect(result.fileType).toBe('code');
			});

			it('should extract text from .py file', async () => {
				const code = 'def hello():\n    return "world"';
				const buffer = Buffer.from(code, 'utf-8');
				const result = await extractText(buffer, 'script.py');

				expect(result.text).toBe(code);
				expect(result.fileType).toBe('code');
			});

			it('should extract text from .json file', async () => {
				const json = '{"key": "value"}';
				const buffer = Buffer.from(json, 'utf-8');
				const result = await extractText(buffer, 'data.json');

				expect(result.text).toBe(json);
				expect(result.fileType).toBe('code');
			});
		});

		describe('PDF files', () => {
			it('should handle PDF extraction error gracefully', async () => {
				// Create invalid PDF buffer (will fail unpdf parsing)
				const buffer = Buffer.from('Not a valid PDF', 'utf-8');

				await expect(extractText(buffer, 'invalid.pdf')).rejects.toThrow(FileExtractionError);

				try {
					await extractText(buffer, 'invalid.pdf');
				} catch (error) {
					expect(error).toBeInstanceOf(FileExtractionError);
					expect((error as FileExtractionError).code).toBe('PDF_PARSE_ERROR');
					expect((error as FileExtractionError).message).toContain('invalid.pdf');
				}
			});
		});

		describe('image files', () => {
			it('should classify .png as image with warning', async () => {
				const buffer = Buffer.from('fake png data');
				const result = await extractText(buffer, 'photo.png');

				expect(result.fileType).toBe('image');
				expect(result.extension).toBe('png');
				expect(result.text).toBe(''); // No OCR in MVP
				expect(result.warnings).toBeDefined();
				expect(result.warnings![0]).toContain('OCR not yet supported');
			});

			it('should classify .jpg as image', async () => {
				const buffer = Buffer.from('fake jpg data');
				const result = await extractText(buffer, 'photo.jpg');

				expect(result.fileType).toBe('image');
				expect(result.extension).toBe('jpg');
			});

			it('should classify .gif as image', async () => {
				const buffer = Buffer.from('fake gif data');
				const result = await extractText(buffer, 'animation.gif');

				expect(result.fileType).toBe('image');
				expect(result.extension).toBe('gif');
			});
		});

		describe('spreadsheet files', () => {
			it('should extract text from .csv file', async () => {
				const csv = 'name,age\nAlice,30\nBob,25';
				const buffer = Buffer.from(csv, 'utf-8');
				const result = await extractText(buffer, 'data.csv');

				expect(result.text).toBe(csv);
				expect(result.fileType).toBe('spreadsheet');
				expect(result.extension).toBe('csv');
			});

			it('should classify .xlsx with warning (not supported in MVP)', async () => {
				const buffer = Buffer.from('fake xlsx data');
				const result = await extractText(buffer, 'spreadsheet.xlsx');

				expect(result.fileType).toBe('spreadsheet');
				expect(result.extension).toBe('xlsx');
				expect(result.text).toBe('');
				expect(result.warnings).toBeDefined();
				expect(result.warnings![0]).toContain('CSV format supported');
			});
		});

		describe('other file types', () => {
			it('should classify unknown extension as other', async () => {
				const buffer = Buffer.from('some content');
				const result = await extractText(buffer, 'file.xyz');

				expect(result.fileType).toBe('other');
				expect(result.extension).toBe('xyz');
				expect(result.text).toBe('');
				expect(result.warnings).toBeDefined();
				expect(result.warnings![0]).toContain('Unsupported file type');
			});

			it('should handle file with no extension', async () => {
				const buffer = Buffer.from('content');
				const result = await extractText(buffer, 'README');

				expect(result.extension).toBe('');
				expect(result.fileType).toBe('other');
			});

			it('should handle filename with multiple dots', async () => {
				const content = 'test content';
				const buffer = Buffer.from(content);
				const result = await extractText(buffer, 'my.file.name.txt');

				expect(result.extension).toBe('txt');
				expect(result.fileType).toBe('text');
				expect(result.text).toBe(content);
			});
		});

		describe('edge cases', () => {
			it('should throw EMPTY_FILE for 0-byte buffer', async () => {
				const buffer = Buffer.alloc(0);

				await expect(extractText(buffer, 'empty.txt')).rejects.toThrow(FileExtractionError);

				try {
					await extractText(buffer, 'empty.txt');
				} catch (error) {
					expect((error as FileExtractionError).code).toBe('EMPTY_FILE');
				}
			});

			it('should throw FILE_TOO_LARGE for oversized file', async () => {
				const buffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB

				await expect(extractText(buffer, 'large.txt')).rejects.toThrow(FileExtractionError);

				try {
					await extractText(buffer, 'large.txt');
				} catch (error) {
					expect((error as FileExtractionError).code).toBe('FILE_TOO_LARGE');
				}
			});

			it('should handle Latin-1 encoded text', async () => {
				const content = 'Café résumé naïve'; // Contains Latin-1 chars
				const buffer = Buffer.from(content, 'latin1');
				const result = await extractText(buffer, 'latin1.txt');

				// Should extract something (even if not perfect UTF-8 decode)
				expect(result.text).toBeTruthy();
				expect(result.fileType).toBe('text');
			});

			it('should count words correctly', async () => {
				const tests = [
					{ content: 'one', expected: 1 },
					{ content: 'one two', expected: 2 },
					{ content: 'one  two  three', expected: 3 }, // Multiple spaces
					{ content: 'one\ntwo\nthree', expected: 3 }, // Newlines
					{ content: '  one  two  ', expected: 2 } // Leading/trailing whitespace
				];

				for (const test of tests) {
					const buffer = Buffer.from(test.content);
					const result = await extractText(buffer, 'test.txt');
					expect(result.wordCount).toBe(test.expected);
				}
			});

			it('should handle Unicode characters', async () => {
				const content = 'Hello 世界 🌍 émoji';
				const buffer = Buffer.from(content, 'utf-8');
				const result = await extractText(buffer, 'unicode.txt');

				expect(result.text).toBe(content);
				expect(result.charCount).toBe(content.length);
			});

			it('should generate valid ExtractionResult structure', async () => {
				const buffer = Buffer.from('test');
				const result = await extractText(buffer, 'test.txt');

				// Verify all required fields
				expect(result).toHaveProperty('text');
				expect(result).toHaveProperty('fileType');
				expect(result).toHaveProperty('contentHash');
				expect(result).toHaveProperty('fileSizeBytes');
				expect(result).toHaveProperty('wordCount');
				expect(result).toHaveProperty('charCount');
				expect(result).toHaveProperty('filename');
				expect(result).toHaveProperty('extension');
				expect(result).toHaveProperty('success');

				// Verify types
				expect(typeof result.text).toBe('string');
				expect(typeof result.fileType).toBe('string');
				expect(typeof result.contentHash).toBe('string');
				expect(typeof result.fileSizeBytes).toBe('number');
				expect(typeof result.wordCount).toBe('number');
				expect(typeof result.charCount).toBe('number');
				expect(typeof result.filename).toBe('string');
				expect(typeof result.extension).toBe('string');
				expect(typeof result.success).toBe('boolean');
			});
		});
	});
});
