/**
 * File Processing & Chunking Configuration
 *
 * Centralized constants for file upload, extraction, chunking, embedding,
 * batch processing, retry logic, and progress tracking.
 */

/** File size and content limits */
export const FILE_PROCESSING = {
	/** Maximum file size in megabytes */
	maxFileSizeMB: 10,
	/** Maximum file size in bytes (10 * 1024 * 1024) */
	maxFileSizeBytes: 10 * 1024 * 1024,
	/** Maximum content length after extraction (characters) */
	maxContentLength: 100000,
	/** Word count threshold for triggering LLM overview generation */
	wordCountThreshold: 2000,
	/** Number of words used for heuristic overview (beginning) */
	heuristicWords: 1000,
	/** Number of words from beginning for LLM overview */
	llmFirstWords: 2000,
	/** Number of words from end for LLM overview */
	llmLastWords: 500
} as const;

/** Semantic chunking parameters */
export const CHUNKING = {
	/** Target chunk size in tokens (ideal) */
	targetTokens: 768,
	/** Maximum chunk size in tokens (hard limit) */
	maxTokens: 1024,
	/** Minimum chunk size in tokens (hard limit) */
	minTokens: 256,
	/** Cosine similarity threshold for chunk boundary detection */
	similarityThreshold: 0.5
} as const;

/** Embedding generation configuration */
export const EMBEDDING = {
	/** Vector dimensions for voyage-3 model */
	dimensions: 1024,
	/** Maximum token estimate for embedding input */
	maxTokenEstimate: 32000,
	/** Delay between individual embedding API calls (ms) */
	delayMs: 120
} as const;

/** Batch processing limits */
export const BATCH_PROCESSING = {
	/** Number of chunks to compress in parallel */
	compressionSize: 5,
	/** Number of chunks to embed in parallel */
	embeddingSize: 5,
	/** Delay between compression/embedding batches (ms) */
	delayBetweenBatchesMs: 5000
} as const;

/** Retry configuration for API calls */
export const RETRY_CONFIG = {
	/** Maximum retry attempts before failing */
	maxAttempts: 3,
	/** Base delay before first retry (ms) */
	baseDelayMs: 1000,
	/** Exponential backoff multiplier */
	backoffMultiplier: 2,
	/** Maximum reconnection attempts for SSE */
	maxReconnectAttempts: 5
} as const;

/** File processing progress phase boundaries (0-100) */
export const PROGRESS_PHASES = {
	/** Text extraction complete */
	extraction: 10,
	/** Overview generation + chunking complete */
	overviewAndChunking: 30,
	/** Chunk 0 (overview) compression complete */
	chunk0Compression: 40,
	/** Detail chunk compression start */
	detailCompressionStart: 40,
	/** Detail chunk compression end */
	detailCompressionEnd: 70,
	/** Embedding generation start */
	embeddingStart: 70,
	/** Embedding generation end */
	embeddingEnd: 90,
	/** Database save start */
	saveStart: 90,
	/** Processing complete */
	complete: 100
} as const;
