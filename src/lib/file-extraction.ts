import { createHash } from 'crypto';
import { extractText as extractPdfText } from 'unpdf';
import { FILE_PROCESSING } from '$lib/config/processing';
import { createMessage } from '$lib/api/anthropic-client';
import { DEFAULT_CONVERSATION_MODEL } from '$lib/config/models';

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
		validateFileSize(buffer, FILE_PROCESSING.maxFileSizeMB);

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
				// Images: Use Claude vision for OCR and description
				text = await ocrImageWithClaude(buffer, filename, extension);
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
 * Perform OCR on image using Claude's vision capabilities
 *
 * @param buffer - Image file buffer
 * @param filename - Original filename for logging
 * @param extension - File extension (e.g., 'jpg', 'png')
 * @returns Extracted text and visual description
 * @throws FileExtractionError if OCR fails
 */
async function ocrImageWithClaude(buffer: Buffer, filename: string, extension: string): Promise<string> {
	try {
		console.log(`[OCR] Starting Claude image extraction for: ${filename}`);

		const base64Image = buffer.toString('base64');

		// Map file extension to MIME type
		const mimeTypeMap: Record<string, string> = {
			'jpg': 'image/jpeg',
			'jpeg': 'image/jpeg',
			'png': 'image/png',
			'gif': 'image/gif',
			'webp': 'image/webp',
			'bmp': 'image/bmp',
			'svg': 'image/svg+xml',
			'ico': 'image/x-icon'
		};
		const mediaType = mimeTypeMap[extension] || 'image/jpeg';

		// Send image to Claude for OCR and description
		const response = await createMessage({
			model: DEFAULT_CONVERSATION_MODEL,
			max_tokens: 4096,
			messages: [{
				role: 'user',
				content: [
					{
						type: 'image',
						source: {
							type: 'base64',
							media_type: mediaType,
							data: base64Image
						}
					},
					{
						type: 'text',
						text: 'Extract all visible text from this image. If the image contains charts, diagrams, medical scans, or other visual elements, describe them in detail. Output the extracted text first, then visual descriptions. Be thorough and preserve layout where possible.'
					}
				]
			}]
		});

		const extractedText = response.content[0].type === 'text' ? response.content[0].text : '';
		console.log(`[OCR] Image extraction complete: ${extractedText.length} characters extracted`);

		return extractedText;

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new FileExtractionError(
			`Image OCR failed for ${filename}: ${errorMessage}`,
			'PDF_PARSE_ERROR', // Reuse same error code for OCR failures
			error
		);
	}
}

/**
 * Perform OCR on PDF using Claude's native PDF support
 *
 * Claude can directly read PDF files, so we don't need to convert to images.
 * This is simpler and more accurate than image-based OCR.
 *
 * @param buffer - PDF file buffer
 * @param filename - Original filename for logging
 * @returns Extracted text from PDF
 * @throws FileExtractionError if OCR fails
 */
async function ocrPdfWithClaude(buffer: Buffer, filename: string): Promise<string> {
	try {
		console.log(`[OCR] Starting Claude PDF extraction for scanned PDF: ${filename}`);

		const base64Pdf = buffer.toString('base64');

		// Send PDF directly to Claude - it has native PDF support!
		const response = await createMessage({
			model: DEFAULT_CONVERSATION_MODEL,
			max_tokens: 4096,
			messages: [{
				role: 'user',
				content: [
					{
						type: 'document',
						source: {
							type: 'base64',
							media_type: 'application/pdf',
							data: base64Pdf
						}
					},
					{
						type: 'text',
						text: 'Extract all text from this PDF document. Preserve the layout and formatting as much as possible. Output only the extracted text, no commentary or preamble.'
					}
				]
			}]
		});

		const extractedText = response.content[0].type === 'text' ? response.content[0].text : '';
		console.log(`[OCR] Extraction complete: ${extractedText.length} characters extracted`);

		return extractedText;

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new FileExtractionError(
			`OCR failed for ${filename}: ${errorMessage}`,
			'PDF_PARSE_ERROR',
			error
		);
	}
}

/**
 * Extract text from PDF using unpdf, with OCR fallback for scanned PDFs
 *
 * @param buffer - PDF file buffer
 * @param filename - Original filename for error messages
 * @returns Extracted text
 * @throws FileExtractionError if both extraction and OCR fail
 */
async function extractFromPdf(buffer: Buffer, filename: string): Promise<string> {
	try {
		// STEP 1: Try standard text extraction first (fast, free)
		const uint8Array = new Uint8Array(buffer);
		const result = await extractPdfText(uint8Array, { mergePages: true });
		const extractedText = result.text || '';

		// STEP 2: If no text extracted, assume scanned PDF → Use OCR
		if (!extractedText.trim()) {
			console.log(`[PDF Extraction] No extractable text found in ${filename}, falling back to OCR...`);
			return await ocrPdfWithClaude(buffer, filename);
		}

		// STEP 3: Return extracted text
		return extractedText;

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
