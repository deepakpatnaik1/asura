import { VoyageAIClient } from 'voyageai';

// Get API key from environment variable
// In SvelteKit runtime, this will be loaded via $env/static/private in server hooks
// For direct Node execution (tests), use process.env
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY || '';

// ============================================================================
// CONSTANTS
// ============================================================================

const MODEL_NAME = 'voyage-3' as const;
const EMBEDDING_DIMENSIONS = 1024;
const MAX_TOKEN_ESTIMATE = 32000;

// Rough approximation: 1 token ≈ 4 characters
// Used for client-side validation before API call
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

// ============================================================================
// ERROR CLASS
// ============================================================================

export type VectorizationErrorCode =
	| 'EMPTY_TEXT'
	| 'TEXT_TOO_LONG'
	| 'INVALID_API_KEY'
	| 'API_RATE_LIMIT'
	| 'INVALID_EMBEDDING_DIMENSIONS'
	| 'API_ERROR'
	| 'UNKNOWN_ERROR';

/**
 * Custom error class for vectorization failures
 * Includes specific error codes for precise error handling
 */
export class VectorizationError extends Error {
	public readonly code: VectorizationErrorCode;
	public readonly details?: any;

	constructor(
		message: string,
		code: VectorizationErrorCode,
		details?: any
	) {
		super(message);
		this.name = 'VectorizationError';
		this.code = code;
		this.details = details;
	}
}

// ============================================================================
// CLIENT INITIALIZATION
// ============================================================================

// Initialize Voyage AI client once at module load
// Reuse across all calls for performance
const voyageClient = new VoyageAIClient({
	apiKey: VOYAGE_API_KEY
});

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Generate a 1024-dimensional embedding from text using Voyage AI
 *
 * @param text - Text to embed (file description, decision arc, factual chunk, etc.)
 * @returns Promise resolving to array of exactly 1024 numbers
 * @throws VectorizationError if embedding generation fails
 *
 * @example
 * const embedding = await generateEmbedding('User decided to pivot to B2C market');
 * console.log(embedding.length); // 1024
 */
export async function generateEmbedding(text: string): Promise<number[]> {
	try {
		// Validate input
		validateInput(text);

		// Validate environment
		validateEnvironment();

		// Call Voyage AI API
		console.log('[Vectorization] Generating embedding for text:', text.substring(0, 50) + '...');
		const response = await voyageClient.embed({
			input: text,
			model: MODEL_NAME,
			inputType: 'document' // For stored documents/files
		});

		// Extract embedding from response
		const embedding = response.data[0]?.embedding;

		// Validate output dimensions
		validateEmbeddingDimensions(embedding);

		console.log('[Vectorization] Successfully generated 1024-dim embedding');
		return embedding;

	} catch (error) {
		// Re-throw known errors
		if (error instanceof VectorizationError) {
			throw error;
		}

		// Detect rate limit errors
		if (error instanceof Error && error.message.includes('rate limit')) {
			throw new VectorizationError(
				`Voyage AI rate limit exceeded: ${error.message}`,
				'API_RATE_LIMIT',
				error
			);
		}

		// Wrap generic API errors
		const message = error instanceof Error ? error.message : String(error);
		throw new VectorizationError(
			`Voyage AI API error: ${message}`,
			'API_ERROR',
			error
		);
	}
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate input text before API call
 * @throws VectorizationError if validation fails
 */
function validateInput(text: string): void {
	// Check for empty text
	if (!text || text.trim().length === 0) {
		throw new VectorizationError(
			'Cannot generate embedding for empty text',
			'EMPTY_TEXT'
		);
	}

	// Check text length (estimate tokens)
	const tokenCount = estimateTokens(text);
	if (tokenCount > MAX_TOKEN_ESTIMATE) {
		throw new VectorizationError(
			`Text is too long (~${tokenCount} tokens, max ${MAX_TOKEN_ESTIMATE})`,
			'TEXT_TOO_LONG',
			{ estimatedTokens: tokenCount, maxTokens: MAX_TOKEN_ESTIMATE }
		);
	}
}

/**
 * Validate that VOYAGE_API_KEY environment variable is set
 * @throws VectorizationError if API key is missing
 */
function validateEnvironment(): void {
	if (!VOYAGE_API_KEY) {
		throw new VectorizationError(
			'VOYAGE_API_KEY environment variable not set',
			'INVALID_API_KEY'
		);
	}
}

/**
 * Validate that embedding has exactly 1024 dimensions
 * @throws VectorizationError if dimensions don't match
 */
function validateEmbeddingDimensions(embedding: any): void {
	if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
		throw new VectorizationError(
			`Expected ${EMBEDDING_DIMENSIONS}-dimensional embedding, got ${embedding?.length || 0}`,
			'INVALID_EMBEDDING_DIMENSIONS',
			{ expectedDimensions: EMBEDDING_DIMENSIONS, actualDimensions: embedding?.length }
		);
	}

	// Verify all values are numbers
	if (!embedding.every((val: any) => typeof val === 'number')) {
		throw new VectorizationError(
			'Embedding contains non-numeric values',
			'INVALID_EMBEDDING_DIMENSIONS',
			{ expectedType: 'number[]' }
		);
	}
}
