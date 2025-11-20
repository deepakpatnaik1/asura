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
// TYPE EXPORTS
// ============================================================================

/**
 * Type-safe access to configuration values
 * Use these types when passing config to functions
 */
export type FileProcessingConfig = typeof FILE_PROCESSING;
export type ChunkingConfig = typeof CHUNKING;
export type EmbeddingConfig = typeof EMBEDDING;
