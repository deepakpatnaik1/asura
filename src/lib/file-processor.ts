import { supabase } from './supabase';
import { extractText, validateFileSize, generateContentHash } from './file-extraction';
import { generateFileOverview, chunkTextBySemantic } from './file-chunker';
import { compressChunk, type ChunkCompressionResult } from './file-compressor';
import { generateEmbedding } from './vectorization';
import type { FileType } from './file-extraction';
import { FileExtractionError } from './file-extraction';
import { FileChunkerError } from './file-chunker';
import { FileCompressionError } from './file-compressor';
import { VectorizationError } from './vectorization';
import { processBatched } from './batch-processor';

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
	| 'CHUNKING_ERROR'
	| 'COMPRESSION_ERROR'
	| 'EMBEDDING_ERROR'
	| 'DUPLICATE_FILE'
	| 'DATABASE_ERROR'
	| 'UNKNOWN_ERROR';

/**
 * Processing stages in order (updated for chunking pipeline)
 */
export type ProcessingStage =
	| 'extraction'
	| 'chunking'
	| 'compression'
	| 'embedding'
	| 'finalization'
	| 'completed';

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
	file_path: string | null;
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
 * Chunking parameters
 */
const TARGET_CHUNK_TOKENS = 768;
const SIMILARITY_THRESHOLD = 0.5;

/**
 * Progress phase boundaries (percentages)
 */
const PROGRESS_EXTRACTION = 10;
const PROGRESS_OVERVIEW = 20;
const PROGRESS_CHUNKING = 30;
const PROGRESS_CHUNK0_COMPRESSION = 40;
const PROGRESS_DETAIL_COMPRESSION_START = 40;
const PROGRESS_DETAIL_COMPRESSION_END = 70;
const PROGRESS_EMBEDDING_START = 70;
const PROGRESS_EMBEDDING_END = 90;
const PROGRESS_SAVE_START = 90;
const PROGRESS_COMPLETE = 100;

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
 * Process an uploaded file through the complete chunking pipeline
 *
 * NEW CHUNKING FLOW (Tasks 6-7):
 * 1. Extract text (0-10%)
 * 2. Generate Chunk 0 overview (10-20%)
 * 3. Semantic chunking (20-30%)
 * 4. Compress Chunk 0 (30-40%)
 * 5. Compress detail chunks (40-70%, granular progress)
 * 6. Generate embeddings for all chunks (70-90%, granular progress)
 * 7. Save all chunks to file_chunks table (90-100%)
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
	// 1. Create pending file (fast)
	const { fileId, extraction } = await createFilePending(input, {
		skipDuplicateCheck: options?.skipDuplicateCheck
	});

	// 2. Process in background (slow) - AWAIT since this is all-in-one function
	return await processFileBackground(fileId, extraction, input.filename, {
		onProgress: options?.onProgress
	});
}

/**
 * Create pending file record with initial extraction
 *
 * This is the "fast path" - returns real file ID quickly (~1 second)
 * so client can receive it and match subsequent SSE updates.
 *
 * Flow:
 * 1. Extract text from file
 * 2. Generate content hash
 * 3. Check for duplicates (optional)
 * 4. Create DB record with status='pending', progress=0
 * 5. Return file ID
 *
 * @param input - File data and metadata
 * @param options - Optional processing options
 * @returns File ID and extraction data
 * @throws FileProcessorError for validation or critical failures
 */
export async function createFilePending(
	input: ProcessFileInput,
	options?: {
		skipDuplicateCheck?: boolean;
	}
): Promise<{
	fileId: string;
	extraction: { text: string; fileType: FileType; contentHash: string };
}> {
	// 1. Validate input
	validateProcessFileInput(input);

	// 2. Extract text from file
	let text: string;
	let fileType: FileType;
	let contentHash: string;

	try {
		const extraction = await extractText(input.fileBuffer, input.filename);
		text = extraction.text;
		fileType = extraction.fileType;
		contentHash = extraction.contentHash;
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

	// 3. Check for duplicates (single-user scope - userId always null)
	if (!options?.skipDuplicateCheck) {
		try {
			const duplicate = await checkDuplicate(contentHash, null);
			if (duplicate.isDuplicate) {
				throw new FileProcessorError(
					`File already exists (duplicate content hash: ${contentHash.substring(0, 8)}...)`,
					'DUPLICATE_FILE',
					'extraction',
					{ existingFileId: duplicate.existingFileId, contentHash: contentHash }
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
	let fileId: string;
	try {
		const createResult = await createFileRecord(
			null, // userId: Single-user mode, always null
			input.filename,
			contentHash,
			fileType
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

	// 5. Return file ID and extraction
	return {
		fileId,
		extraction: {
			text,
			fileType,
			contentHash
		}
	};
}

/**
 * Complete file processing in background with chunking pipeline
 *
 * This is the "slow path" - chunking, compression, embedding, and finalization.
 * Should be called without awaiting (fire-and-forget) after createFilePending().
 *
 * NEW CHUNKING FLOW:
 * Phase 1: Extraction (0-10%) - ALREADY DONE
 * Phase 2: Generate Chunk 0 overview (10-20%)
 * Phase 3: Semantic chunking (20-30%)
 * Phase 4: Compress Chunk 0 (30-40%)
 * Phase 5: Compress detail chunks (40-70%, granular progress)
 * Phase 6: Generate embeddings for all chunks (70-90%, granular progress)
 * Phase 7: Save all chunks to file_chunks table (90-100%)
 *
 * @param fileId - File ID from createFilePending()
 * @param extraction - Extraction result from createFilePending()
 * @param filename - Original filename
 * @param options - Optional processing options
 * @returns Processing result
 */
export async function processFileBackground(
	fileId: string,
	extraction: { text: string; fileType: FileType; contentHash: string },
	filename: string,
	options?: {
		onProgress?: ProgressCallback;
	}
): Promise<ProcessFileOutput> {
	try {
		const fullText = extraction.text;
		const fileType = extraction.fileType;

		// Update to extraction complete (10%)
		await updateProgress(fileId, PROGRESS_EXTRACTION, 'extraction');
		await reportProgress(
			options?.onProgress,
			fileId,
			'extraction',
			PROGRESS_EXTRACTION,
			'Text extraction complete'
		);

		// ========================================================================
		// PHASE 2: Generate Chunk 0 Overview (10-20%)
		// ========================================================================

		let chunk0Text: string;
		try {
			await reportProgress(
				options?.onProgress,
				fileId,
				'chunking',
				PROGRESS_EXTRACTION,
				'Generating file overview...'
			);

			chunk0Text = await generateFileOverview(fullText, filename, fileType);

			await updateProgress(fileId, PROGRESS_OVERVIEW, 'chunking');
			await reportProgress(
				options?.onProgress,
				fileId,
				'chunking',
				PROGRESS_OVERVIEW,
				'File overview generated'
			);
		} catch (error) {
			if (error instanceof FileChunkerError) {
				await markFileFailed(
					fileId,
					'CHUNKING_ERROR',
					`Overview generation failed: ${error.message}`,
					'chunking'
				);

				return {
					id: fileId,
					filename: filename,
					fileType: fileType,
					status: 'failed',
					error: {
						code: 'CHUNKING_ERROR',
						message: error.message,
						stage: 'chunking'
					}
				};
			}

			await markFileFailed(
				fileId,
				'UNKNOWN_ERROR',
				`Overview generation error: ${error instanceof Error ? error.message : String(error)}`,
				'chunking'
			);

			return {
				id: fileId,
				filename: filename,
				fileType: fileType,
				status: 'failed',
				error: {
					code: 'CHUNKING_ERROR',
					message: error instanceof Error ? error.message : String(error),
					stage: 'chunking'
				}
			};
		}

		// ========================================================================
		// PHASE 3: Semantic Chunking (20-30%)
		// ========================================================================

		let detailChunks: string[];
		try {
			await reportProgress(
				options?.onProgress,
				fileId,
				'chunking',
				PROGRESS_OVERVIEW,
				'Creating semantic chunks...'
			);

			const chunkingResult = await chunkTextBySemantic({
				text: fullText,
				targetChunkTokens: TARGET_CHUNK_TOKENS,
				similarityThreshold: SIMILARITY_THRESHOLD
			});

			detailChunks = chunkingResult.chunks;

			await updateProgress(fileId, PROGRESS_CHUNKING, 'chunking');
			await reportProgress(
				options?.onProgress,
				fileId,
				'chunking',
				PROGRESS_CHUNKING,
				`Created ${detailChunks.length} detail chunks`
			);
		} catch (error) {
			if (error instanceof FileChunkerError) {
				await markFileFailed(
					fileId,
					'CHUNKING_ERROR',
					`Semantic chunking failed: ${error.message}`,
					'chunking'
				);

				return {
					id: fileId,
					filename: filename,
					fileType: fileType,
					status: 'failed',
					error: {
						code: 'CHUNKING_ERROR',
						message: error.message,
						stage: 'chunking'
					}
				};
			}

			await markFileFailed(
				fileId,
				'UNKNOWN_ERROR',
				`Chunking error: ${error instanceof Error ? error.message : String(error)}`,
				'chunking'
			);

			return {
				id: fileId,
				filename: filename,
				fileType: fileType,
				status: 'failed',
				error: {
					code: 'CHUNKING_ERROR',
					message: error instanceof Error ? error.message : String(error),
					stage: 'chunking'
				}
			};
		}

		// ========================================================================
		// PHASE 4: Compress Chunk 0 (30-40%)
		// ========================================================================

		let chunk0Compressed: ChunkCompressionResult;
		const totalChunks = detailChunks.length + 1; // +1 for Chunk 0

		try {
			await reportProgress(
				options?.onProgress,
				fileId,
				'compression',
				PROGRESS_CHUNKING,
				'Compressing file overview...'
			);

			console.log(`[FileProcessor] Compressing Chunk 0 for file ${fileId} (${filename})`);
			chunk0Compressed = await compressChunk({
				chunkText: chunk0Text,
				chunkIndex: 0,
				totalChunks: totalChunks,
				filename: filename,
				fileType: fileType
			});
			console.log(`[FileProcessor] Chunk 0 compression successful for file ${fileId}`);

			await updateProgress(fileId, PROGRESS_CHUNK0_COMPRESSION, 'compression');
			await reportProgress(
				options?.onProgress,
				fileId,
				'compression',
				PROGRESS_CHUNK0_COMPRESSION,
				'Chunk 0 compressed'
			);
		} catch (error) {
			console.error(`[FileProcessor] Chunk 0 compression failed for file ${fileId}:`, error);
			if (error instanceof FileCompressionError) {
				console.error(`[FileProcessor] Compression error details:`, {
					code: error.code,
					message: error.message,
					details: error.details
				});
				await markFileFailed(
					fileId,
					'COMPRESSION_ERROR',
					`Chunk 0 compression failed: ${error.message}`,
					'compression'
				);

				return {
					id: fileId,
					filename: filename,
					fileType: fileType,
					status: 'failed',
					error: {
						code: 'COMPRESSION_ERROR',
						message: error.message,
						stage: 'compression'
					}
				};
			}

			await markFileFailed(
				fileId,
				'UNKNOWN_ERROR',
				`Chunk 0 compression error: ${error instanceof Error ? error.message : String(error)}`,
				'compression'
			);

			return {
				id: fileId,
				filename: filename,
				fileType: fileType,
				status: 'failed',
				error: {
					code: 'COMPRESSION_ERROR',
					message: error instanceof Error ? error.message : String(error),
					stage: 'compression'
				}
			};
		}

		// ========================================================================
		// PHASE 5: Compress Detail Chunks (40-70%)
		// ========================================================================

		const detailChunksCompressed: ChunkCompressionResult[] = [];

		try {
			// Report start of parallel compression
			await reportProgress(
				options?.onProgress,
				fileId,
				'compression',
				PROGRESS_DETAIL_COMPRESSION_START,
				`Compressing ${detailChunks.length} detail chunks in parallel...`
			);

			// Compress all detail chunks in batches of 10
			const compressedResults = await processBatched(
				detailChunks,
				async (chunkText, i) => {
					const chunkIndex = i + 1; // Start at 1 (Chunk 0 already done)
					return compressChunk({
						chunkText: chunkText,
						chunkIndex: chunkIndex,
						totalChunks: totalChunks,
						filename: filename,
						fileType: fileType
					});
				},
				{
					batchSize: 10,
					onProgress: async (completed, total) => {
						// Calculate progress: 40% → 70% (30% range)
						const progress = Math.round(40 + (30 * completed / total));
						await reportProgress(
							options?.onProgress,
							fileId,
							'compression',
							progress,
							`Compressed ${completed}/${total} chunks`
						);
					}
				}
			);
			detailChunksCompressed.push(...compressedResults);

			// Report completion
			await updateProgress(fileId, PROGRESS_DETAIL_COMPRESSION_END, 'compression');
			await reportProgress(
				options?.onProgress,
				fileId,
				'compression',
				PROGRESS_DETAIL_COMPRESSION_END,
				`Compressed ${detailChunks.length} detail chunks`
			);
		} catch (error) {
			if (error instanceof FileCompressionError) {
				await markFileFailed(
					fileId,
					'COMPRESSION_ERROR',
					`Detail chunk compression failed: ${error.message}`,
					'compression'
				);

				return {
					id: fileId,
					filename: filename,
					fileType: fileType,
					status: 'failed',
					error: {
						code: 'COMPRESSION_ERROR',
						message: error.message,
						stage: 'compression'
					}
				};
			}

			await markFileFailed(
				fileId,
				'UNKNOWN_ERROR',
				`Detail chunk compression error: ${error instanceof Error ? error.message : String(error)}`,
				'compression'
			);

			return {
				id: fileId,
				filename: filename,
				fileType: fileType,
				status: 'failed',
				error: {
					code: 'COMPRESSION_ERROR',
					message: error instanceof Error ? error.message : String(error),
					stage: 'compression'
				}
			};
		}


		// ========================================================================
		// PHASE 6: Generate Embeddings (70-90%)
		// ========================================================================

		const allCompressed = [chunk0Compressed, ...detailChunksCompressed];
		const embeddings: number[][] = [];

		try {
			// Report start of parallel embedding generation
			await reportProgress(
				options?.onProgress,
				fileId,
				'embedding',
				PROGRESS_EMBEDDING_START,
				`Generating ${allCompressed.length} embeddings in parallel...`
			);

			// Generate all embeddings in batches of 10
			const generatedEmbeddings = await processBatched(
				allCompressed,
				async (compressed) => generateEmbedding(compressed.description),
				{
					batchSize: 10,
					onProgress: async (completed, total) => {
						// Calculate progress: 70% → 90% (20% range)
						const progress = Math.round(70 + (20 * completed / total));
						await reportProgress(
							options?.onProgress,
							fileId,
							'embedding',
							progress,
							`Generated ${completed}/${total} embeddings`
						);
					}
				}
			);
			embeddings.push(...generatedEmbeddings);

			// Report completion
			await updateProgress(fileId, PROGRESS_EMBEDDING_END, 'embedding');
			await reportProgress(
				options?.onProgress,
				fileId,
				'embedding',
				PROGRESS_EMBEDDING_END,
				`Generated ${allCompressed.length} embeddings`
			);
		} catch (error) {
			if (error instanceof VectorizationError) {
				await markFileFailed(
					fileId,
					'EMBEDDING_ERROR',
					`Embedding generation failed: ${error.message}`,
					'embedding'
				);

				return {
					id: fileId,
					filename: filename,
					fileType: fileType,
					status: 'failed',
					error: {
						code: 'EMBEDDING_ERROR',
						message: error.message,
						stage: 'embedding'
					}
				};
			}

			await markFileFailed(
				fileId,
				'UNKNOWN_ERROR',
				`Embedding generation error: ${error instanceof Error ? error.message : String(error)}`,
				'embedding'
			);

			return {
				id: fileId,
				filename: filename,
				fileType: fileType,
				status: 'failed',
				error: {
					code: 'EMBEDDING_ERROR',
					message: error instanceof Error ? error.message : String(error),
					stage: 'embedding'
				}
			};
		}

		// ========================================================================
		// PHASE 7: Save to Database (90-100%)
		// ========================================================================

		try {
			await reportProgress(
				options?.onProgress,
				fileId,
				'finalization',
				PROGRESS_SAVE_START,
				'Saving chunks to database...'
			);

			await saveAllChunksToDatabase(
				fileId,
				null, // userId: Single-user mode, always null
				chunk0Text,
				detailChunks,
				allCompressed,
				embeddings,
				filename
			);

			await updateProgress(fileId, PROGRESS_COMPLETE, 'completed');
			await reportProgress(
				options?.onProgress,
				fileId,
				'completed',
				PROGRESS_COMPLETE,
				'Processing complete'
			);
		} catch (error) {
			await markFileFailed(
				fileId,
				'DATABASE_ERROR',
				`Failed to save chunks: ${error instanceof Error ? error.message : String(error)}`,
				'finalization'
			);

			return {
				id: fileId,
				filename: filename,
				fileType: fileType,
				status: 'failed',
				error: {
					code: 'DATABASE_ERROR',
					message: error instanceof Error ? error.message : String(error),
					stage: 'finalization'
				}
			};
		}

		// ========================================================================
		// SUCCESS
		// ========================================================================

		return {
			id: fileId,
			filename: filename,
			fileType: fileType,
			status: 'ready'
		};
	} catch (error) {
		// Unexpected error - update DB and return
		await markFileFailed(
			fileId,
			'UNKNOWN_ERROR',
			error instanceof Error ? error.message : String(error),
			'extraction'
		);

		return {
			id: fileId,
			filename: filename,
			fileType: extraction.fileType,
			status: 'failed',
			error: {
				code: 'UNKNOWN_ERROR',
				message: error instanceof Error ? error.message : String(error),
				stage: 'extraction'
			}
		};
	}
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Save all chunks to database in one transaction
 *
 * Inserts all chunks into file_chunks table and updates files table status.
 *
 * @param fileId - File ID
 * @param userId - User ID
 * @param chunk0Text - Original Chunk 0 text
 * @param detailChunkTexts - Array of detail chunk texts
 * @param compressed - Array of compressed chunk results
 * @param embeddings - Array of embeddings
 * @param filename - Original filename
 */
async function saveAllChunksToDatabase(
	fileId: string,
	userId: string | null,
	chunk0Text: string,
	detailChunkTexts: string[],
	compressed: ChunkCompressionResult[],
	embeddings: number[][],
	filename: string
): Promise<void> {
	// Build chunk records for insertion
	const chunkRecords = compressed.map((chunk, index) => {
		const chunkText = index === 0 ? chunk0Text : detailChunkTexts[index - 1];

		return {
			file_id: fileId,
			user_id: userId,
			chunk_index: chunk.chunkIndex,
			chunk_text: chunkText, // Original chunk text
			description: chunk.description, // Compressed description
			embedding: embeddings[index], // 1024-dim vector
			created_at: new Date().toISOString()
		};
	});

	// Insert all chunks in one transaction
	const { error: chunksError } = await supabase.from('file_chunks').insert(chunkRecords);

	if (chunksError) {
		throw new Error(`Failed to save chunks: ${chunksError.message}`);
	}

	// Update files table with completion status
	const { error: filesError } = await supabase
		.from('files')
		.update({
			status: 'ready',
			progress: 100,
			processing_stage: 'completed',
			description: compressed[0].description, // Chunk 0 description
			updated_at: new Date().toISOString()
		})
		.eq('id', fileId);

	if (filesError) {
		throw new Error(`Failed to update file: ${filesError.message}`);
	}
}

/**
 * Update file progress and processing stage
 *
 * @param fileId - File ID
 * @param progress - Progress percentage (0-100)
 * @param stage - Processing stage
 */
async function updateProgress(
	fileId: string,
	progress: number,
	stage: ProcessingStage
): Promise<void> {
	const { error } = await supabase
		.from('files')
		.update({
			progress: Math.round(progress),
			processing_stage: stage,
			updated_at: new Date().toISOString()
		})
		.eq('id', fileId);

	if (error) {
		console.error(`Failed to update progress: ${error.message}`);
	}
}

/**
 * Create file record in database with initial status=pending
 */
async function createFileRecord(
	userId: string | null,
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

	const { data, error } = await supabase.from('files').insert([record]).select('id');

	if (error) {
		throw new Error(`Database insert failed: ${error.message}`);
	}

	if (!data || data.length === 0) {
		throw new Error('No data returned from database insert');
	}

	return { id: data[0].id };
}

/**
 * Mark file as failed with error details
 * Includes retry logic with exponential backoff
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
 * Check for duplicate file by content hash (user-scoped)
 * Only checks within the same user's files
 */
async function checkDuplicate(
	contentHash: string,
	userId: string | null
): Promise<{ isDuplicate: boolean; existingFileId?: string }> {
	// Handle null/undefined userId properly (PostgreSQL requires IS NULL, not = 'null')
	let query = supabase.from('files').select('id');

	if (userId === null || userId === undefined) {
		query = query.is('user_id', null);
	} else {
		query = query.eq('user_id', userId);
	}

	const { data, error } = await query.eq('content_hash', contentHash).limit(1);

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

	// NOTE: userId validation removed - single-user app
	// Multi-user support will be added in subsequent branch with Google Auth

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
