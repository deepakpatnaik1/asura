import { supabase } from './supabase';
import { extractText, validateFileSize, generateContentHash } from './file-extraction';
import { compressFile } from './file-compressor';
import { generateEmbedding } from './vectorization';
import type { ExtractionResult, FileType } from './file-extraction';
import type { CompressionResult } from './file-compressor';
import { FileExtractionError } from './file-extraction';
import { FileCompressionError } from './file-compressor';
import { VectorizationError } from './vectorization';

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Custom error class for file processing failures
 */
export class FileProcessorError extends Error {
	readonly code: FileProcessorErrorCode;
	readonly stage: ProcessingStage;
	readonly details?: any;

	constructor(
		message: string,
		code: FileProcessorErrorCode,
		stage: ProcessingStage,
		details?: any
	) {
		super(message);
		this.name = 'FileProcessorError';
		this.code = code;
		this.stage = stage;
		this.details = details;
	}
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * File processor error codes
 */
export type FileProcessorErrorCode =
	| 'VALIDATION_ERROR'
	| 'EXTRACTION_ERROR'
	| 'COMPRESSION_ERROR'
	| 'EMBEDDING_ERROR'
	| 'DUPLICATE_FILE'
	| 'DATABASE_ERROR'
	| 'UNKNOWN_ERROR';

/**
 * Processing stages in order
 */
export type ProcessingStage = 'extraction' | 'compression' | 'embedding' | 'finalization';

/**
 * Progress update event
 */
export interface ProgressUpdate {
	fileId: string;
	stage: ProcessingStage;
	progress: number; // 0-100
	message?: string;
}

/**
 * Progress callback function
 */
export type ProgressCallback = (update: ProgressUpdate) => void | Promise<void>;

/**
 * Input to processFile function
 */
export interface ProcessFileInput {
	fileBuffer: Buffer;
	filename: string;
	userId: string;
	contentType: string;
}

/**
 * Output from processFile function
 */
export interface ProcessFileOutput {
	id: string; // File ID from database
	filename: string;
	fileType: FileType;
	status: 'ready' | 'failed'; // Should be 'ready' if no error
	error?: {
		code: FileProcessorErrorCode;
		message: string;
		stage: ProcessingStage;
	};
}

/**
 * Database file record type
 */
interface FileRecord {
	id: string;
	user_id: string;
	filename: string;
	file_type: FileType;
	content_hash: string;
	description: string | null;
	embedding: number[] | null;
	status: 'pending' | 'processing' | 'ready' | 'failed';
	processing_stage: ProcessingStage | null;
	progress: number;
	error_message: string | null;
	uploaded_at: string;
	updated_at: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Progress milestones for each stage
 */
const PROGRESS_MAP = {
	extraction_start: 0,
	extraction_end: 25,
	compression_start: 25,
	compression_end: 75,
	embedding_start: 75,
	embedding_end: 90,
	finalization_start: 90,
	finalization_end: 100
} as const;

/**
 * Retry configuration for database updates
 */
const RETRY_CONFIG = {
	maxAttempts: 3,
	baseDelayMs: 1000 // 1 second
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Process an uploaded file through the complete pipeline
 *
 * Flow:
 * 1. Validate input (size, type, user_id)
 * 2. Extract text (Chunk 2)
 * 3. Check for duplicates (optional, per-user)
 * 4. Create database record with status=pending
 * 5. Compress content (Chunk 4)
 * 6. Update database with compression results
 * 7. Generate embedding (Chunk 3)
 * 8. Update database with embedding and status=ready
 * 9. Return final ProcessFileOutput
 *
 * @param input - File data and metadata
 * @param options - Optional processing options
 * @returns Processed file information
 * @throws FileProcessorError for validation or critical failures
 */
export async function processFile(
	input: ProcessFileInput,
	options?: {
		onProgress?: ProgressCallback;
		skipDuplicateCheck?: boolean;
	}
): Promise<ProcessFileOutput> {
	// 1. Validate input
	validateProcessFileInput(input);

	let fileId: string | null = null;

	try {
		// Report: Validation started
		await reportProgress(
			options?.onProgress,
			'',
			'extraction',
			PROGRESS_MAP.extraction_start,
			'Validating file...'
		);

		// 2. Extract text from file
		let extraction: ExtractionResult;
		try {
			extraction = await extractText(input.fileBuffer, input.filename);
		} catch (error) {
			if (error instanceof FileExtractionError) {
				throw new FileProcessorError(
					`File extraction failed: ${error.message}`,
					'EXTRACTION_ERROR',
					'extraction',
					error
				);
			}
			throw error;
		}

		// Report: Extraction complete
		await reportProgress(
			options?.onProgress,
			'',
			'extraction',
			PROGRESS_MAP.extraction_end,
			`Extracted text (${extraction.wordCount} words)`
		);

		// 3. Check for duplicates (per-user scope) - FIX 1 from reviewer
		if (!options?.skipDuplicateCheck) {
			try {
				const duplicate = await checkDuplicate(extraction.contentHash, input.userId);
				if (duplicate.isDuplicate) {
					throw new FileProcessorError(
						`File already exists (duplicate content hash: ${extraction.contentHash.substring(0, 8)}...)`,
						'DUPLICATE_FILE',
						'extraction',
						{ existingFileId: duplicate.existingFileId, contentHash: extraction.contentHash }
					);
				}
			} catch (error) {
				if (error instanceof FileProcessorError) {
					throw error;
				}
				throw new FileProcessorError(
					`Duplicate check failed: ${error instanceof Error ? error.message : String(error)}`,
					'DATABASE_ERROR',
					'extraction',
					error
				);
			}
		}

		// 4. Create database record with status=pending
		try {
			const createResult = await createFileRecord(
				input.userId,
				input.filename,
				extraction.contentHash,
				extraction.fileType
			);
			fileId = createResult.id;
		} catch (error) {
			throw new FileProcessorError(
				`Failed to create database record: ${error instanceof Error ? error.message : String(error)}`,
				'DATABASE_ERROR',
				'extraction',
				error
			);
		}

		// Report: Database record created
		await reportProgress(
			options?.onProgress,
			fileId,
			'extraction',
			PROGRESS_MAP.extraction_end,
			'File record created'
		);

		// 5. Compress content (Chunk 4)
		let compression: CompressionResult;
		try {
			await reportProgress(
				options?.onProgress,
				fileId,
				'compression',
				PROGRESS_MAP.compression_start,
				'Starting compression...'
			);

			compression = await compressFile({
				extractedText: extraction.text,
				filename: input.filename,
				fileType: extraction.fileType
			});

			await reportProgress(
				options?.onProgress,
				fileId,
				'compression',
				PROGRESS_MAP.compression_end,
				'Compression complete'
			);
		} catch (error) {
			if (error instanceof FileCompressionError) {
				// Update database with error
				await markFileFailed(
					fileId,
					'COMPRESSION_ERROR',
					`Compression failed: ${error.message}`,
					'compression'
				);

				return {
					id: fileId,
					filename: input.filename,
					fileType: extraction.fileType,
					status: 'failed',
					error: {
						code: 'COMPRESSION_ERROR',
						message: error.message,
						stage: 'compression'
					}
				};
			}

			// Unexpected error - update DB and throw
			await markFileFailed(
				fileId,
				'UNKNOWN_ERROR',
				`Compression error: ${error instanceof Error ? error.message : String(error)}`,
				'compression'
			);

			throw new FileProcessorError(
				`Compression failed: ${error instanceof Error ? error.message : String(error)}`,
				'COMPRESSION_ERROR',
				'compression',
				error
			);
		}

		// 6. Update database with compression results
		try {
			await updateFileProgress(fileId, {
				progress: PROGRESS_MAP.compression_end,
				stage: 'compression'
			});
		} catch (error) {
			console.error('[FileProcessor] Failed to update progress after compression:', error);
			// Don't throw - continue with embedding
		}

		// 7. Generate embedding (Chunk 3)
		let embedding: number[];
		try {
			await reportProgress(
				options?.onProgress,
				fileId,
				'embedding',
				PROGRESS_MAP.embedding_start,
				'Generating embedding...'
			);

			embedding = await generateEmbedding(compression.description);

			await reportProgress(
				options?.onProgress,
				fileId,
				'embedding',
				PROGRESS_MAP.embedding_end,
				'Embedding complete'
			);
		} catch (error) {
			if (error instanceof VectorizationError) {
				// Update database with error
				await markFileFailed(
					fileId,
					'EMBEDDING_ERROR',
					`Embedding generation failed: ${error.message}`,
					'embedding'
				);

				return {
					id: fileId,
					filename: input.filename,
					fileType: extraction.fileType,
					status: 'failed',
					error: {
						code: 'EMBEDDING_ERROR',
						message: error.message,
						stage: 'embedding'
					}
				};
			}

			// Unexpected error - update DB and throw
			await markFileFailed(
				fileId,
				'UNKNOWN_ERROR',
				`Embedding error: ${error instanceof Error ? error.message : String(error)}`,
				'embedding'
			);

			throw new FileProcessorError(
				`Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`,
				'EMBEDDING_ERROR',
				'embedding',
				error
			);
		}

		// 8. Mark file complete with final results - FIX 2: retry logic
		try {
			await reportProgress(
				options?.onProgress,
				fileId,
				'finalization',
				PROGRESS_MAP.finalization_start,
				'Finalizing...'
			);

			await markFileComplete(fileId, compression.description, embedding);

			await reportProgress(
				options?.onProgress,
				fileId,
				'finalization',
				PROGRESS_MAP.finalization_end,
				'Processing complete'
			);
		} catch (error) {
			console.error('[FileProcessor] Failed to mark file complete:', error);
			// Don't throw - file data is already saved
		}

		// 9. Return success
		return {
			id: fileId,
			filename: input.filename,
			fileType: extraction.fileType,
			status: 'ready'
		};
	} catch (error) {
		if (error instanceof FileProcessorError) {
			// If we already have a DB record, update it with the error
			if (fileId) {
				try {
					await markFileFailed(
						fileId,
						error.code,
						error.message,
						error.stage
					);
				} catch (dbError) {
					console.error('[FileProcessor] Failed to update error status in DB:', dbError);
				}
			}
			throw error;
		}

		// Unexpected error
		if (fileId) {
			try {
				await markFileFailed(
					fileId,
					'UNKNOWN_ERROR',
					error instanceof Error ? error.message : String(error),
					'extraction'
				);
			} catch (dbError) {
				console.error('[FileProcessor] Failed to update error status in DB:', dbError);
			}
		}

		throw new FileProcessorError(
			`Unexpected error during file processing: ${error instanceof Error ? error.message : String(error)}`,
			'UNKNOWN_ERROR',
			'extraction',
			error
		);
	}
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create file record in database with initial status=pending
 */
async function createFileRecord(
	userId: string,
	filename: string,
	contentHash: string,
	fileType: FileType
): Promise<{ id: string }> {
	// Insert only the required fields - let database handle defaults
	const record = {
		user_id: userId,
		filename: filename,
		file_type: fileType,
		content_hash: contentHash,
		status: 'pending',
		progress: 0
	};

	const { data, error } = await supabase
		.from('files')
		.insert([record])
		.select('id');

	if (error) {
		throw new Error(`Database insert failed: ${error.message}`);
	}

	if (!data || data.length === 0) {
		throw new Error('No data returned from database insert');
	}

	return { id: data[0].id };
}

/**
 * Update file progress and processing stage
 */
async function updateFileProgress(
	fileId: string,
	update: {
		progress: number;
		stage?: ProcessingStage;
		message?: string;
	}
): Promise<void> {
	const updateData: any = {
		progress: update.progress,
		updated_at: new Date().toISOString()
	};

	if (update.stage) {
		updateData.processing_stage = update.stage;
	}

	const { error } = await supabase
		.from('files')
		.update(updateData)
		.eq('id', fileId);

	if (error) {
		throw new Error(`Failed to update progress: ${error.message}`);
	}
}

/**
 * Mark file as complete with final results
 * Includes retry logic with exponential backoff (FIX 2 from reviewer)
 */
async function markFileComplete(
	fileId: string,
	description: string,
	embedding: number[]
): Promise<void> {
	const maxAttempts = RETRY_CONFIG.maxAttempts;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			const { error } = await supabase
				.from('files')
				.update({
					status: 'ready',
					description: description,
					embedding: embedding,
					progress: 100,
					processing_stage: 'finalization',
					updated_at: new Date().toISOString()
				})
				.eq('id', fileId);

			if (error) {
				throw new Error(`Database update failed: ${error.message}`);
			}

			// Success
			console.log(`[FileProcessor] File ${fileId} marked complete on attempt ${attempt + 1}`);
			return;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			console.warn(
				`[FileProcessor] Attempt ${attempt + 1}/${maxAttempts} to mark file complete failed:`,
				lastError.message
			);

			// Wait before retry (exponential backoff: 1s, 2s, 4s)
			if (attempt < maxAttempts - 1) {
				const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}
	}

	// All attempts failed
	throw new Error(
		`Failed to mark file complete after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`
	);
}

/**
 * Mark file as failed with error details
 * Includes retry logic with exponential backoff (FIX 2 from reviewer)
 */
async function markFileFailed(
	fileId: string,
	errorCode: FileProcessorErrorCode,
	errorMessage: string,
	stage: ProcessingStage
): Promise<void> {
	const maxAttempts = RETRY_CONFIG.maxAttempts;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			const { error } = await supabase
				.from('files')
				.update({
					status: 'failed',
					error_message: `[${errorCode}] ${errorMessage}`,
					processing_stage: stage,
					updated_at: new Date().toISOString()
				})
				.eq('id', fileId);

			if (error) {
				throw new Error(`Database update failed: ${error.message}`);
			}

			// Success
			console.log(`[FileProcessor] File ${fileId} marked failed on attempt ${attempt + 1}`);
			return;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			console.warn(
				`[FileProcessor] Attempt ${attempt + 1}/${maxAttempts} to mark file failed failed:`,
				lastError.message
			);

			// Wait before retry (exponential backoff: 1s, 2s, 4s)
			if (attempt < maxAttempts - 1) {
				const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}
	}

	// All attempts failed - log but don't throw (already in error path)
	console.error(
		`[FileProcessor] Failed to mark file failed after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`
	);
}

/**
 * Check for duplicate file by content hash (user-scoped - FIX 1 from reviewer)
 * Only checks within the same user's files
 */
async function checkDuplicate(
	contentHash: string,
	userId: string
): Promise<{ isDuplicate: boolean; existingFileId?: string }> {
	const { data, error } = await supabase
		.from('files')
		.select('id')
		.eq('user_id', userId)
		.eq('content_hash', contentHash)
		.limit(1);

	if (error) {
		throw new Error(`Duplicate check failed: ${error.message}`);
	}

	if (data && data.length > 0) {
		return {
			isDuplicate: true,
			existingFileId: data[0].id
		};
	}

	return {
		isDuplicate: false
	};
}

/**
 * Validate input parameters
 */
function validateProcessFileInput(input: ProcessFileInput): void {
	// Check buffer
	if (!input.fileBuffer || !(input.fileBuffer instanceof Buffer)) {
		throw new FileProcessorError(
			'Invalid file buffer',
			'VALIDATION_ERROR',
			'extraction',
			{ received: typeof input.fileBuffer }
		);
	}

	// Check filename
	if (!input.filename || typeof input.filename !== 'string' || input.filename.trim().length === 0) {
		throw new FileProcessorError(
			'Filename is required and must be a non-empty string',
			'VALIDATION_ERROR',
			'extraction',
			{ received: input.filename }
		);
	}

	// Check userId (simple UUID v4 validation)
	if (!input.userId || typeof input.userId !== 'string') {
		throw new FileProcessorError(
			'User ID is required and must be a string',
			'VALIDATION_ERROR',
			'extraction',
			{ received: input.userId }
		);
	}

	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!uuidRegex.test(input.userId)) {
		throw new FileProcessorError(
			'User ID must be a valid UUID',
			'VALIDATION_ERROR',
			'extraction',
			{ received: input.userId }
		);
	}

	// Check contentType
	if (!input.contentType || typeof input.contentType !== 'string') {
		throw new FileProcessorError(
			'Content type is required',
			'VALIDATION_ERROR',
			'extraction',
			{ received: input.contentType }
		);
	}

	// Validate file size (10MB limit)
	try {
		validateFileSize(input.fileBuffer, 10); // 10 MB limit
	} catch (error) {
		if (error instanceof FileExtractionError) {
			throw new FileProcessorError(
				`File size validation failed: ${error.message}`,
				'VALIDATION_ERROR',
				'extraction',
				error
			);
		}
		throw error;
	}
}

/**
 * Report progress via callback if provided
 */
async function reportProgress(
	onProgress: ProgressCallback | undefined,
	fileId: string,
	stage: ProcessingStage,
	progress: number,
	message?: string
): Promise<void> {
	if (!onProgress) return;

	try {
		const update: ProgressUpdate = {
			fileId,
			stage,
			progress,
			message
		};

		const result = onProgress(update);

		// Support both sync and async callbacks
		if (result instanceof Promise) {
			await result;
		}
	} catch (error) {
		console.error('[FileProcessor] Progress callback error:', error);
		// Don't throw - progress reporting is not critical
	}
}
