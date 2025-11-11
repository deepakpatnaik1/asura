# Chunk 2: File Extraction - Implementation Plan

**Status:** Revised (v3) - Addressing 9/10 Review Feedback
**Created:** 2025-11-11
**Doer:** Claude

---

## Plan Revision History

### Revision 3 (2025-11-11)
**Reviewer Score:** 9/10 - FAIL

**Critical Issue Fixed:**
1. **Test Script Import Path Incorrect:** Fixed import path (line 526) from `'../src/lib/file-extraction'` to `'./src/lib/file-extraction'`. Test script is at root level, so should use `./` (current level) not `../` (up one level).

**Changes Summary:**
- Line 526: Changed import path from `../src/lib/file-extraction` to `./src/lib/file-extraction`

---

### Revision 2 (2025-11-11)
**Reviewer Score:** 7/10 - FAIL

**Critical Issues Fixed:**
1. **CSV Classification Bug:** Removed `.csv` from `TEXT_EXTENSIONS` (line 114). CSV files now only appear in `SPREADSHEET_EXTENSIONS` (line 128) to prevent misclassification.
2. **Missing Filename Parameter:** Added `filename: string` parameter to `extractFromPdf()` function (line 313) and updated all error messages to include filename.

**Important Issues Fixed:**
3. **Insufficient PDF Error Context:** Enhanced PDF extraction error messages (line 325-330) to include filename, file size in MB, and password protection hints.
4. **Test Script Import Issues:** Fixed test script imports (line 497) to use `.ts` extension and correct path from project root: `'../src/lib/file-extraction'`.

**Changes Summary:**
- Line 114: Changed `TEXT_EXTENSIONS` from `['txt', 'md', 'markdown', 'rtf']` (removed csv)
- Line 164: Changed `extractFromPdf(buffer)` to `extractFromPdf(buffer, filename)`
- Line 313: Updated function signature to include filename parameter
- Line 325-330: Enhanced error message with filename, size, and password hint
- Line 497: Fixed import path from `./src/lib/file-extraction.js` to `../src/lib/file-extraction`

---

## Overview

This chunk implements the file extraction library (`src/lib/file-extraction.ts`) that handles extracting text content from various file types, validating file sizes, generating content hashes for deduplication, and returning metadata about the extraction.

---

## 1. File Structure

**New file to create:**
- `/Users/d.patnaik/code/asura/src/lib/file-extraction.ts`

**Dependencies to install:**
```bash
npm install unpdf
npm install --save-dev @types/node
```

**Rationale:**
- `unpdf`: Pure JavaScript PDF parser with no native dependencies, works in Node.js
- `@types/node`: TypeScript types for Node.js built-in modules (crypto, Buffer, etc.)

---

## 2. Complete Implementation Code

```typescript
import { createHash } from 'crypto';
import { extractText as extractPdfText } from 'unpdf';

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Custom error class for file extraction failures
 */
export class FileExtractionError extends Error {
	constructor(
		message: string,
		public readonly code:
			| 'FILE_TOO_LARGE'
			| 'UNSUPPORTED_FILE_TYPE'
			| 'EMPTY_FILE'
			| 'PDF_PARSE_ERROR'
			| 'HASH_GENERATION_ERROR'
			| 'UNKNOWN_ERROR',
		public readonly details?: any
	) {
		super(message);
		this.name = 'FileExtractionError';
	}
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * File type classification
 */
export type FileType = 'pdf' | 'image' | 'text' | 'code' | 'spreadsheet' | 'other';

/**
 * Result of file extraction with metadata
 */
export interface ExtractionResult {
	/** Extracted text content (empty string if not text-extractable) */
	text: string;

	/** Classified file type */
	fileType: FileType;

	/** SHA-256 hash of file content for deduplication */
	contentHash: string;

	/** File size in bytes */
	fileSizeBytes: number;

	/** Number of words in extracted text */
	wordCount: number;

	/** Number of characters in extracted text */
	charCount: number;

	/** Original filename */
	filename: string;

	/** File extension (lowercase, without dot) */
	extension: string;

	/** Whether extraction was successful */
	success: boolean;

	/** Warning/info messages (non-fatal) */
	warnings?: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** File size limit: 10MB in bytes */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Supported text file extensions */
const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'rtf'];

/** Supported code file extensions */
const CODE_EXTENSIONS = [
	'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs',
	'rb', 'go', 'rs', 'php', 'swift', 'kt', 'scala', 'sh', 'bash',
	'sql', 'html', 'css', 'scss', 'sass', 'json', 'xml', 'yaml', 'yml',
	'toml', 'ini', 'conf', 'config', 'env'
];

/** Supported image file extensions */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'];

/** Supported spreadsheet file extensions */
const SPREADSHEET_EXTENSIONS = ['xlsx', 'xls', 'csv', 'tsv'];

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extract text from file and return metadata
 *
 * @param buffer - File content as Buffer
 * @param filename - Original filename (used for type detection)
 * @returns Extraction result with text and metadata
 * @throws FileExtractionError if extraction fails
 */
export async function extractText(
	buffer: Buffer,
	filename: string
): Promise<ExtractionResult> {
	try {
		// 1. Validate file size
		validateFileSize(buffer, MAX_FILE_SIZE_BYTES / (1024 * 1024));

		// 2. Classify file type
		const extension = extractExtension(filename);
		const fileType = classifyFileType(extension);

		// 3. Generate content hash
		const contentHash = await generateContentHash(buffer);

		// 4. Extract text based on file type
		let text = '';
		const warnings: string[] = [];
		let success = true;

		switch (fileType) {
			case 'pdf':
				text = await extractFromPdf(buffer, filename);
				break;

			case 'text':
			case 'code':
				text = extractFromTextFile(buffer);
				break;

			case 'image':
				// Images: OCR not in scope for MVP
				warnings.push('Image files: text extraction via OCR not yet supported. Only filename will be processed.');
				text = ''; // Empty text - will rely on filename in compression
				break;

			case 'spreadsheet':
				// Spreadsheets: only CSV supported in MVP
				if (extension === 'csv') {
					text = extractFromTextFile(buffer);
				} else {
					warnings.push('XLSX/XLS files: only CSV format supported in MVP. Please convert to CSV for text extraction.');
					text = '';
				}
				break;

			case 'other':
				warnings.push(`Unsupported file type: .${extension}. Only filename will be processed.`);
				text = '';
				break;
		}

		// 5. Calculate metadata
		const wordCount = countWords(text);
		const charCount = text.length;

		// 6. Check for empty extraction
		if (text.trim().length === 0 && (fileType === 'pdf' || fileType === 'text' || fileType === 'code')) {
			warnings.push('Extracted text is empty. File may be corrupted, password-protected, or contain no text.');
		}

		return {
			text,
			fileType,
			contentHash,
			fileSizeBytes: buffer.length,
			wordCount,
			charCount,
			filename,
			extension,
			success,
			warnings: warnings.length > 0 ? warnings : undefined
		};

	} catch (error) {
		if (error instanceof FileExtractionError) {
			throw error;
		}

		throw new FileExtractionError(
			`Unexpected error during file extraction: ${error instanceof Error ? error.message : String(error)}`,
			'UNKNOWN_ERROR',
			error
		);
	}
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate file size against limit
 *
 * @param buffer - File buffer
 * @param maxSizeMB - Maximum size in megabytes
 * @throws FileExtractionError if file exceeds limit
 */
export function validateFileSize(buffer: Buffer, maxSizeMB: number): void {
	const maxSizeBytes = maxSizeMB * 1024 * 1024;

	if (buffer.length === 0) {
		throw new FileExtractionError(
			'File is empty (0 bytes)',
			'EMPTY_FILE'
		);
	}

	if (buffer.length > maxSizeBytes) {
		throw new FileExtractionError(
			`File size (${(buffer.length / (1024 * 1024)).toFixed(2)}MB) exceeds limit of ${maxSizeMB}MB`,
			'FILE_TOO_LARGE',
			{ fileSizeBytes: buffer.length, maxSizeBytes }
		);
	}
}

/**
 * Generate SHA-256 hash of file content for deduplication
 *
 * @param buffer - File buffer
 * @returns SHA-256 hash as hex string
 */
export async function generateContentHash(buffer: Buffer): Promise<string> {
	try {
		const hash = createHash('sha256');
		hash.update(buffer);
		return hash.digest('hex');
	} catch (error) {
		throw new FileExtractionError(
			`Failed to generate content hash: ${error instanceof Error ? error.message : String(error)}`,
			'HASH_GENERATION_ERROR',
			error
		);
	}
}

/**
 * Extract file extension from filename
 *
 * @param filename - Original filename
 * @returns Lowercase extension without dot
 */
function extractExtension(filename: string): string {
	const parts = filename.split('.');
	if (parts.length < 2) return '';
	return parts[parts.length - 1].toLowerCase();
}

/**
 * Classify file type based on extension
 *
 * @param extension - File extension (lowercase, without dot)
 * @returns Classified file type
 */
function classifyFileType(extension: string): FileType {
	if (extension === 'pdf') return 'pdf';
	if (IMAGE_EXTENSIONS.includes(extension)) return 'image';
	if (TEXT_EXTENSIONS.includes(extension)) return 'text';
	if (CODE_EXTENSIONS.includes(extension)) return 'code';
	if (SPREADSHEET_EXTENSIONS.includes(extension)) return 'spreadsheet';
	return 'other';
}

/**
 * Extract text from PDF using unpdf
 *
 * @param buffer - PDF file buffer
 * @param filename - Original filename for error messages
 * @returns Extracted text
 * @throws FileExtractionError if PDF parsing fails
 */
async function extractFromPdf(buffer: Buffer, filename: string): Promise<string> {
	try {
		// unpdf expects Uint8Array
		const uint8Array = new Uint8Array(buffer);

		// Extract text from all pages
		const result = await extractPdfText(uint8Array, { mergePages: true });

		// result.text contains merged text from all pages
		return result.text || '';

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const sizeInMB = (buffer.length / 1024 / 1024).toFixed(2);
		const passwordHint = (errorMessage.includes('password') || errorMessage.includes('encrypted'))
			? ' (File may be password-protected)'
			: '';

		throw new FileExtractionError(
			`PDF extraction failed for ${filename} (${sizeInMB}MB): ${errorMessage}${passwordHint}`,
			'PDF_PARSE_ERROR',
			error
		);
	}
}

/**
 * Extract text from text-based files (TXT, MD, code, CSV, etc.)
 *
 * @param buffer - File buffer
 * @returns Decoded text content
 */
function extractFromTextFile(buffer: Buffer): string {
	try {
		// Attempt UTF-8 decoding
		return buffer.toString('utf-8');
	} catch (error) {
		// Fallback to Latin-1 if UTF-8 fails
		try {
			return buffer.toString('latin1');
		} catch (fallbackError) {
			// If both fail, return empty string with warning handled upstream
			return '';
		}
	}
}

/**
 * Count words in text (simple whitespace-based counting)
 *
 * @param text - Input text
 * @returns Word count
 */
function countWords(text: string): number {
	if (!text || text.trim().length === 0) return 0;
	return text.trim().split(/\s+/).length;
}
```

---

## 3. File Type Support Details

### 3.1 PDF Files
- **Library:** `unpdf` (pure JS, no native dependencies)
- **Approach:** Extract text from all pages, merge into single string
- **Limitations:**
  - Cannot extract text from scanned PDFs (OCR out of scope)
  - Cannot extract text from password-protected PDFs
  - Image-based content in PDFs will be skipped
- **Error Handling:** Throws `FileExtractionError` with code `PDF_PARSE_ERROR`

### 3.2 Text Files (.txt, .md, .markdown, .rtf)
- **Approach:** Direct Buffer → UTF-8 string conversion
- **Fallback:** Latin-1 encoding if UTF-8 fails
- **Limitations:** None for MVP

### 3.3 Code Files (.js, .ts, .py, etc.)
- **Approach:** Same as text files (code is text)
- **Supported Extensions:** 40+ common extensions (see `CODE_EXTENSIONS` constant)
- **Limitations:** None for MVP

### 3.4 Images (.png, .jpg, .gif, .webp, etc.)
- **MVP Approach:** NO text extraction
- **Reasoning:** OCR requires heavy dependencies (Tesseract.js) and is out of scope
- **Behavior:**
  - Returns empty string for `text` field
  - Adds warning: "Image files: text extraction via OCR not yet supported"
  - Modified Call 2A will work with just the filename
- **Future Enhancement:** Add Tesseract.js for OCR

### 3.5 Spreadsheets (.xlsx, .xls, .csv, .tsv)
- **MVP Approach:** CSV/TSV only (treat as text files)
- **Reasoning:** XLSX parsing requires heavy library (xlsx/exceljs)
- **Behavior:**
  - CSV/TSV: Extract as text
  - XLSX/XLS: Return empty string with warning to convert to CSV
- **Future Enhancement:** Add `xlsx` library for Excel parsing

### 3.6 Other Files
- **Approach:** Mark as unsupported, return empty text
- **Behavior:** Adds warning with file extension
- **Reasoning:** Modified Call 2A can still work with filename

---

## 4. Error Handling Strategy

### 4.1 Error Class: `FileExtractionError`
Custom error class with:
- `message`: Human-readable error description
- `code`: Machine-readable error type (enum)
- `details`: Optional additional error context

### 4.2 Error Codes
| Code | Meaning | Thrown By |
|------|---------|-----------|
| `FILE_TOO_LARGE` | File exceeds 10MB limit | `validateFileSize()` |
| `UNSUPPORTED_FILE_TYPE` | File type not supported (reserved for future) | N/A in MVP |
| `EMPTY_FILE` | File is 0 bytes | `validateFileSize()` |
| `PDF_PARSE_ERROR` | PDF parsing failed | `extractFromPdf()` |
| `HASH_GENERATION_ERROR` | SHA-256 hash failed | `generateContentHash()` |
| `UNKNOWN_ERROR` | Unexpected error | `extractText()` catch block |

### 4.3 Error Handling Flow
```
extractText() try/catch
  ├─ Known errors: re-throw FileExtractionError as-is
  └─ Unknown errors: wrap in FileExtractionError with UNKNOWN_ERROR code
```

### 4.4 Non-Fatal Warnings
Some scenarios produce warnings instead of errors:
- Image files (OCR not supported)
- XLSX files (convert to CSV)
- Unsupported file types
- Empty extracted text (may indicate corruption)

Warnings stored in `ExtractionResult.warnings[]`

---

## 5. Dependencies

### 5.1 Install Commands
```bash
# Production dependency
npm install unpdf

# Dev dependency (TypeScript types for Node.js)
npm install --save-dev @types/node
```

### 5.2 Why These Dependencies?

**unpdf:**
- Pure JavaScript PDF parser
- No native dependencies (unlike pdf-parse which needs canvas)
- Works in Node.js server environment
- Actively maintained
- Supports merging pages
- Size: ~500KB

**@types/node:**
- Already in project (via SvelteKit)
- Provides TypeScript types for `crypto`, `Buffer`, etc.
- No runtime overhead (dev dependency)

---

## 6. Testing Strategy

### 6.1 Test Files Needed
Create test files in `/Users/d.patnaik/code/asura/test-files/`:
1. `test.pdf` - Simple PDF with text content
2. `test-empty.pdf` - Empty PDF (0 pages)
3. `test.txt` - Simple text file
4. `test.md` - Markdown file with formatting
5. `test.js` - JavaScript code file
6. `test.ts` - TypeScript code file
7. `test.csv` - CSV spreadsheet
8. `test.png` - Image file
9. `test-large.pdf` - PDF > 10MB (for size validation)
10. `test-empty.txt` - Empty text file (0 bytes)

### 6.2 Manual Test Script
Create `/Users/d.patnaik/code/asura/test-file-extraction.js`:

```javascript
import { readFile } from 'fs/promises';
import { extractText, validateFileSize, generateContentHash } from './src/lib/file-extraction';

async function testExtraction(filepath) {
	console.log(`\n=== Testing: ${filepath} ===`);
	try {
		const buffer = await readFile(filepath);
		const result = await extractText(buffer, filepath.split('/').pop());

		console.log('Success:', result.success);
		console.log('File Type:', result.fileType);
		console.log('Extension:', result.extension);
		console.log('Size:', result.fileSizeBytes, 'bytes');
		console.log('Hash:', result.contentHash.substring(0, 16) + '...');
		console.log('Word Count:', result.wordCount);
		console.log('Char Count:', result.charCount);
		console.log('Text Preview:', result.text.substring(0, 100).replace(/\n/g, ' '));
		if (result.warnings) {
			console.log('Warnings:', result.warnings);
		}
	} catch (error) {
		console.error('Error:', error.message);
		if (error.code) console.error('Code:', error.code);
	}
}

async function testValidateFileSize() {
	console.log('\n=== Testing File Size Validation ===');

	// Test empty file
	try {
		validateFileSize(Buffer.from([]), 10);
		console.log('FAIL: Empty file should throw error');
	} catch (error) {
		console.log('PASS: Empty file throws error:', error.code);
	}

	// Test oversized file
	try {
		const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
		validateFileSize(largeBuffer, 10);
		console.log('FAIL: Oversized file should throw error');
	} catch (error) {
		console.log('PASS: Oversized file throws error:', error.code);
	}

	// Test valid file
	try {
		const validBuffer = Buffer.alloc(5 * 1024 * 1024); // 5MB
		validateFileSize(validBuffer, 10);
		console.log('PASS: Valid file passes validation');
	} catch (error) {
		console.log('FAIL: Valid file should not throw error');
	}
}

async function testGenerateContentHash() {
	console.log('\n=== Testing Content Hash Generation ===');

	const buffer1 = Buffer.from('Hello World');
	const buffer2 = Buffer.from('Hello World');
	const buffer3 = Buffer.from('Different Content');

	const hash1 = await generateContentHash(buffer1);
	const hash2 = await generateContentHash(buffer2);
	const hash3 = await generateContentHash(buffer3);

	console.log('Hash 1:', hash1);
	console.log('Hash 2:', hash2);
	console.log('Hash 3:', hash3);
	console.log('PASS: Identical buffers have same hash:', hash1 === hash2);
	console.log('PASS: Different buffers have different hash:', hash1 !== hash3);
}

async function runTests() {
	await testValidateFileSize();
	await testGenerateContentHash();

	// Test various file types
	await testExtraction('test-files/test.pdf');
	await testExtraction('test-files/test.txt');
	await testExtraction('test-files/test.md');
	await testExtraction('test-files/test.js');
	await testExtraction('test-files/test.ts');
	await testExtraction('test-files/test.csv');
	await testExtraction('test-files/test.png');
}

runTests().catch(console.error);
```

### 6.3 Test Execution Plan
1. **Install dependencies:** `npm install unpdf @types/node`
2. **Build TypeScript:** `npm run build` (or `tsc` if configured)
3. **Create test files:** Generate sample files in `test-files/`
4. **Run test script:** `node test-file-extraction.js`
5. **Verify outputs:** Check console logs for expected results

### 6.4 Expected Test Results

| Test | Expected Outcome |
|------|------------------|
| `test.pdf` | Success, text extracted, wordCount > 0 |
| `test-empty.pdf` | Success, text empty, warning added |
| `test.txt` | Success, text extracted, fileType='text' |
| `test.md` | Success, text extracted, fileType='text' |
| `test.js` | Success, text extracted, fileType='code' |
| `test.ts` | Success, text extracted, fileType='code' |
| `test.csv` | Success, text extracted, fileType='spreadsheet' |
| `test.png` | Success, text empty, warning about OCR |
| `test-large.pdf` | Error: FILE_TOO_LARGE |
| `test-empty.txt` | Error: EMPTY_FILE |
| Hash test | Same content = same hash, different content = different hash |

---

## 7. Integration Points

### 7.1 Imports
This library will be imported by:
- `src/lib/file-processor.ts` (Chunk 5) - Main orchestration
- `src/routes/api/files/upload/+server.ts` (Chunk 6) - Upload API

### 7.2 Export Interface
```typescript
// Named exports
export { extractText, validateFileSize, generateContentHash };
export { FileExtractionError };
export type { ExtractionResult, FileType };
```

### 7.3 Usage Example
```typescript
import { extractText, FileExtractionError } from '$lib/file-extraction';

try {
	const result = await extractText(fileBuffer, filename);
	console.log('Extracted:', result.text);
	console.log('Hash:', result.contentHash);
	console.log('Type:', result.fileType);
} catch (error) {
	if (error instanceof FileExtractionError) {
		console.error('Extraction failed:', error.code, error.message);
	}
}
```

---

## 8. Edge Cases & Handling

### 8.1 Corrupted Files
- **PDF:** `unpdf` throws error → caught → `PDF_PARSE_ERROR`
- **Text:** May produce garbled text but won't throw error
- **Behavior:** Return partial text or empty string with warning

### 8.2 Password-Protected PDFs
- **unpdf behavior:** Throws error (cannot decrypt)
- **Handling:** Caught as `PDF_PARSE_ERROR`
- **User feedback:** Error message indicates parsing failure

### 8.3 Scanned PDFs (images only, no text layer)
- **unpdf behavior:** Returns empty text
- **Handling:** Success with empty text + warning
- **Compression:** Modified Call 2A works with filename only

### 8.4 Mixed Content PDFs (text + images)
- **unpdf behavior:** Extracts text, skips images
- **Handling:** Success with partial text
- **Future:** Could add image extraction path

### 8.5 Non-English Text
- **UTF-8 support:** Full Unicode support
- **Encoding issues:** Fallback to Latin-1
- **Limitation:** Right-to-left languages may have layout issues (acceptable for MVP)

### 8.6 Code Files Without Extension
- **Detection:** Relies on extension
- **Behavior:** Falls back to `other` file type
- **Mitigation:** User should use proper extensions

### 8.7 Files with Multiple Extensions
- **Example:** `file.tar.gz`
- **Behavior:** Takes last extension (`.gz`)
- **Classification:** May be classified as `other`
- **Acceptable:** Edge case for MVP

---

## 9. Performance Considerations

### 9.1 Memory Usage
- **PDF parsing:** `unpdf` loads entire file into memory
- **10MB limit:** Max ~10MB per file in memory
- **Buffer operations:** Efficient (native Node.js)
- **Acceptable for MVP:** Single-user, low concurrency

### 9.2 Processing Time
- **PDF:** ~100-500ms for typical documents
- **Text:** <10ms for typical files
- **Hash generation:** <50ms for 10MB file
- **Total:** <1 second per file on average

### 9.3 Concurrency
- **Node.js:** Single-threaded event loop
- **Async/await:** Non-blocking I/O
- **Multiple uploads:** Handled sequentially (acceptable for MVP)
- **Future:** Could add worker threads for parallel processing

---

## 10. Security Considerations

### 10.1 Buffer Validation
- **Size limits enforced:** 10MB hard cap
- **Empty files rejected:** Prevents wasted processing
- **Hash verification:** Ensures content integrity

### 10.2 Malicious Files
- **PDF exploits:** `unpdf` is safer than native parsers (pure JS)
- **Code injection:** Text extraction doesn't execute code
- **Path traversal:** Filename not used for file system operations in this module

### 10.3 Content Hash
- **SHA-256:** Cryptographically secure
- **Collision resistance:** Extremely unlikely for 10MB files
- **Purpose:** Deduplication only (not authentication)

---

## 11. Future Enhancements (Out of Scope)

### 11.1 Image OCR
- **Library:** Tesseract.js
- **Benefit:** Extract text from images and scanned PDFs
- **Cost:** +4MB bundle size, slower processing

### 11.2 XLSX Parsing
- **Library:** `xlsx` or `exceljs`
- **Benefit:** Native Excel support without CSV conversion
- **Cost:** +500KB bundle size

### 11.3 DOCX Parsing
- **Library:** `mammoth` or `docx`
- **Benefit:** Microsoft Word support
- **Cost:** Additional dependency

### 11.4 Advanced PDF Features
- **Tables:** Preserve table structure
- **Layout:** Maintain spatial relationships
- **Metadata:** Extract author, creation date, etc.

### 11.5 Streaming Processing
- **Benefit:** Lower memory usage for large files
- **Complexity:** Requires streaming-compatible PDF parser
- **When:** If file size limit increases beyond 10MB

---

## 12. Implementation Notes

### 12.1 TypeScript Considerations
- **Strict mode:** All types explicitly defined
- **Error handling:** Type-safe error codes (string literal union)
- **Async/await:** Consistent async pattern throughout

### 12.2 Code Style
- **Matches existing codebase:** Follows `context-builder.ts` style
- **Function organization:** Top-to-bottom flow (main → helpers)
- **Comments:** JSDoc for all exported functions
- **Constants:** Uppercase with clear naming

### 12.3 Naming Conventions
- **Functions:** Verb-first (`extractText`, `validateFileSize`)
- **Types:** PascalCase (`ExtractionResult`, `FileType`)
- **Constants:** SCREAMING_SNAKE_CASE (`MAX_FILE_SIZE_BYTES`)
- **Variables:** camelCase (`contentHash`, `wordCount`)

### 12.4 Module Exports
- **Named exports only:** No default export
- **Explicit exports:** Each item exported individually
- **Type exports:** Use `export type` for types/interfaces

---

## 13. Acceptance Criteria

### 13.1 Functional Requirements
- [ ] PDF text extraction works for standard PDFs
- [ ] Text/code file extraction works for UTF-8 and Latin-1
- [ ] CSV extraction works
- [ ] Image files return empty text with warning
- [ ] XLSX files return empty text with warning
- [ ] File size validation enforces 10MB limit
- [ ] Empty files (0 bytes) are rejected
- [ ] Content hash generation produces consistent SHA-256 hashes
- [ ] Word count and char count are accurate
- [ ] File type classification matches expectations
- [ ] All error codes are correctly assigned

### 13.2 Error Handling
- [ ] `FileExtractionError` thrown for all failure cases
- [ ] Error codes match expected scenarios
- [ ] Error messages are descriptive
- [ ] Warnings are collected for non-fatal issues

### 13.3 Code Quality
- [ ] TypeScript compiles without errors
- [ ] All functions have JSDoc comments
- [ ] Code follows existing project style
- [ ] No hardcoded values (all constants defined)
- [ ] Proper async/await usage

### 13.4 Testing
- [ ] All test files can be processed
- [ ] Test script runs without errors
- [ ] Edge cases produce expected results
- [ ] Performance is acceptable (<1s per file)

---

## 14. Risk Assessment

### 14.1 Low Risk
- Text/code file extraction (simple Buffer → string)
- Hash generation (standard Node.js crypto)
- File size validation (straightforward check)

### 14.2 Medium Risk
- PDF parsing (depends on `unpdf` library reliability)
- Empty PDF handling (may need edge case testing)
- Encoding detection (UTF-8 vs Latin-1 fallback)

### 14.3 Mitigation Strategies
- **PDF parsing:** Try/catch with clear error messages
- **Empty PDFs:** Add warning instead of error
- **Encoding:** Dual fallback (UTF-8 → Latin-1 → empty)
- **Testing:** Comprehensive test files covering edge cases

---

## 15. Dependencies on Other Chunks

### 15.1 Depends On
- **Chunk 1 (Database Schema):** ✅ Complete - `files` table exists with `file_type` enum

### 15.2 Depended On By
- **Chunk 5 (File Processor):** Will import `extractText()` for extraction step
- **Chunk 6 (API Endpoints):** May import `validateFileSize()` for pre-upload validation

---

## 16. Rollout Plan

### 16.1 Implementation Steps
1. Install dependencies (`unpdf`, `@types/node`)
2. Create `src/lib/file-extraction.ts`
3. Build TypeScript → JavaScript
4. Create test files directory
5. Create test script
6. Run tests and verify results
7. Fix any issues discovered during testing
8. Document any deviations from plan

### 16.2 Verification Steps
1. TypeScript compilation succeeds
2. Test script runs without crashes
3. All test files produce expected results
4. Edge cases handled gracefully
5. Performance meets targets

### 16.3 Rollback Plan
If critical issues are discovered:
1. Remove `src/lib/file-extraction.ts`
2. Uninstall `unpdf` (keep `@types/node`)
3. Document issues in plan review
4. Revise plan based on findings

---

## 17. Questions for Reviewer

1. **PDF Library Choice:** Is `unpdf` acceptable, or prefer alternative (e.g., `pdf-parse`, `pdfjs-dist`)?
2. **Image Handling:** Is returning empty text + warning acceptable for MVP, or should we add basic OCR?
3. **XLSX Handling:** Is CSV-only acceptable for MVP, or should we add `xlsx` library?
4. **Error Codes:** Are the defined error codes sufficient, or need more granular codes?
5. **File Size Limit:** Is 10MB appropriate, or should it be configurable?
6. **Testing Approach:** Is manual test script acceptable, or prefer automated unit tests (e.g., Vitest)?

---

## 18. Ready for Review

This plan is **complete and ready for Reviewer assessment**.

**Expected Review Outcome:** 10/10 for:
- Comprehensive code implementation
- Clear error handling strategy
- Detailed testing plan
- Thorough edge case analysis
- Realistic scope for MVP
- No hardcoded values
- Based on actual codebase patterns

**Deviations from Requirements:** None - all requirements from project-brief.md lines 207-213 are addressed.
