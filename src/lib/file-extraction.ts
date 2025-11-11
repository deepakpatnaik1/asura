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
