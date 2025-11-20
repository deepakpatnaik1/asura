/**
 * File Processing Configuration
 *
 * Centralized constants for file upload, extraction, chunking, and vectorization.
 * These values control how files are processed and stored in the system.
 *
 * @module config/processing
 */

// ============================================================================
// FILE PROCESSING
// ============================================================================

/**
 * File upload and extraction limits
 */
export const FILE_PROCESSING = {
	/** Maximum file size in megabytes */
	maxFileSizeMB: 10,

	/** Maximum file size in bytes (computed from MB) */
	maxFileSizeBytes: 10 * 1024 * 1024, // 10MB = 10,485,760 bytes

	/** Maximum content length for text extraction */
	maxContentLength: 100000,

	/** Word count threshold: files below use heuristic overview, above use LLM */
	wordCountThreshold: 2000,

	/** Number of words to extract for heuristic overview (small files) */
	heuristicWords: 1000,

	/** Number of words from start for LLM overview (large files) */
	llmFirstWords: 2000,

	/** Number of words from end for LLM overview (large files) */
	llmLastWords: 500
} as const;

// ============================================================================
// SEMANTIC CHUNKING
// ============================================================================

/**
 * Parameters for semantic chunking algorithm
 * Controls how documents are split into searchable chunks
 */
export const CHUNKING = {
	/** Target chunk size in tokens (aim for this size) */
	targetTokens: 768,

	/** Maximum chunk size in tokens (hard limit) */
	maxTokens: 1024,

	/** Minimum chunk size in tokens (prevent tiny chunks) */
	minTokens: 256,

	/** Similarity threshold for topic shift detection (0.0-1.0) */
	similarityThreshold: 0.5
} as const;

// ============================================================================
// EMBEDDING & VECTORIZATION
// ============================================================================

/**
 * Configuration for vector embeddings
 * Used with Voyage AI API for semantic search
 */
export const EMBEDDING = {
	/** Embedding vector dimensions (Voyage-3 outputs 1024-dim vectors) */
	dimensions: 1024,

	/** Maximum tokens for embedding input (Voyage AI limit) */
	maxTokens: 32000,

	/** Character-to-token ratio for estimation (1 token ≈ 4 characters) */
	charsPerToken: 4
} as const;

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Batch processing configuration for rate limiting
 * Controls concurrent operations and delays between batches
 */
export const BATCH_PROCESSING = {
	/** Default batch size for general operations */
	defaultBatchSize: 10,

	/** Batch size for chunk compression (Modified Call 2A/2B) */
	chunkCompressionBatchSize: 5,

	/** Batch size for embedding generation */
	embeddingBatchSize: 5,

	/** Delay between batches in milliseconds (rate limiting) */
	delayMs: 5000
} as const;

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

/**
 * Retry logic configuration for API calls and SSE connections
 * Controls exponential backoff behavior
 */
export const RETRY_CONFIG = {
	/** Maximum number of retry attempts for API calls */
	maxRetries: 3,

	/** Initial delay before first retry (milliseconds) */
	initialDelay: 1000,

	/** Multiplier for exponential backoff (delay doubles each retry) */
	backoffMultiplier: 2,

	/** HTTP status codes that should trigger retry */
	retryableStatuses: [429, 503],

	/** Maximum SSE reconnection attempts */
	maxReconnectAttempts: 5,

	/** Base delay for SSE reconnection backoff (milliseconds) */
	reconnectBackoffBase: 1000
} as const;

// ============================================================================
// PROGRESS PHASES
// ============================================================================

/**
 * Processing phase progress percentages
 * Maps each file processing stage to its progress range
 */
export const PROGRESS_PHASES = {
	/** Text extraction phase (0-10%) */
	extraction: { start: 0, end: 10 },

	/** Chunking phase (10-30%) */
	chunking: { start: 10, end: 30 },

	/** Compression - Chunk 0 overview (30-40%) */
	compressionOverview: { start: 30, end: 40 },

	/** Compression - Detail chunks (40-70%) */
	compressionDetails: { start: 40, end: 70 },

	/** Embedding generation (70-90%) */
	embedding: { start: 70, end: 90 },

	/** Finalization (90-100%) */
	finalization: { start: 90, end: 100 }
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * Type-safe access to configuration values
 * Use these types when passing config to functions
 */
export type FileProcessingConfig = typeof FILE_PROCESSING;
export type ChunkingConfig = typeof CHUNKING;
export type EmbeddingConfig = typeof EMBEDDING;
export type BatchProcessingConfig = typeof BATCH_PROCESSING;
export type RetryConfig = typeof RETRY_CONFIG;
export type ProgressPhasesConfig = typeof PROGRESS_PHASES;
