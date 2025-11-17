import OpenAI from 'openai';
import type { FileType } from './file-extraction';
import { MAX_TOKENS } from '$lib/config/models';
import { MODIFIED_CALL2A_PROMPT, MODIFIED_CALL2B_PROMPT, CALL3A_PROMPT, CALL3B_PROMPT } from '$lib/prompts';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Custom error class for file compression failures
 */
export class FileCompressionError extends Error {
	constructor(
		message: string,
		public readonly code:
			| 'EMPTY_CONTENT'
			| 'INVALID_FILE_TYPE'
			| 'API_ERROR'
			| 'JSON_PARSE_ERROR'
			| 'VALIDATION_ERROR'
			| 'RATE_LIMIT'
			| 'UNKNOWN_ERROR',
		public readonly details?: any
	) {
		super(message);
		this.name = 'FileCompressionError';
	}
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Input for chunk compression
 */
export interface ChunkCompressionInput {
	/** Single chunk text (not full file) */
	chunkText: string;
	/** Chunk position: 0 = overview, 1+ = detail */
	chunkIndex: number;
	/** Total number of chunks in file */
	totalChunks: number;
	/** Original filename */
	filename: string;
	/** File type classification */
	fileType: FileType;
}

/**
 * Output from chunk compression
 */
export interface ChunkCompressionResult {
	/** Exact filename from input */
	filename: string;
	/** File type from input */
	fileType: FileType;
	/** Compressed description for this chunk */
	description: string;
	/** Which chunk this is */
	chunkIndex: number;
	/** Raw Call 2A response for debugging */
	call2aResponse: Call2Response;
	/** Raw Call 2B response for debugging */
	call2bResponse: Call2Response;
}

/**
 * Call 2A/2B API response structure
 */
export interface Call2Response {
	filename: string;
	file_type: FileType;
	description: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** API Model Configuration - Read from user_settings in compressChunk function */

/** API Call Configuration */
const TEMPERATURE = 0.7;
const MAX_TOKENS_CONFIG = MAX_TOKENS.file; // 1000 tokens - no thinking needed for file compression

/** Max tokens for chunk compression */
const MAX_TOKENS_CHUNK_0 = MAX_TOKENS_CONFIG;  // Chunk 0: No thinking needed, prompt enforces 200-400 char output
const MAX_TOKENS_DETAIL = MAX_TOKENS_CONFIG;    // Detail chunks: No thinking needed, prompt enforces content preservation

/** Validation constants */
const MAX_CONTENT_LENGTH = 100000;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate chunk compression input
 */
function validateChunkInput(input: ChunkCompressionInput): void {
	if (!input.chunkText || input.chunkText.trim().length === 0) {
		throw new FileCompressionError(
			'Chunk text cannot be empty',
			'EMPTY_CONTENT'
		);
	}

	if (input.chunkIndex < 0) {
		throw new FileCompressionError(
			'Chunk index must be non-negative',
			'VALIDATION_ERROR',
			{ providedIndex: input.chunkIndex }
		);
	}

	if (input.totalChunks < 1) {
		throw new FileCompressionError(
			'Total chunks must be at least 1',
			'VALIDATION_ERROR',
			{ providedTotal: input.totalChunks }
		);
	}

	if (input.chunkIndex >= input.totalChunks) {
		throw new FileCompressionError(
			'Chunk index must be less than total chunks',
			'VALIDATION_ERROR',
			{ chunkIndex: input.chunkIndex, totalChunks: input.totalChunks }
		);
	}

	const validFileTypes: FileType[] = ['pdf', 'image', 'text', 'code', 'spreadsheet', 'other'];
	if (!validFileTypes.includes(input.fileType)) {
		throw new FileCompressionError(
			`Invalid file type: ${input.fileType}. Must be one of: ${validFileTypes.join(', ')}`,
			'INVALID_FILE_TYPE',
			{ providedType: input.fileType, validTypes: validFileTypes }
		);
	}
}

/**
 * Validate environment and API key
 */
function validateEnvironment(): void {
	const apiKey = process.env.FIREWORKS_API_KEY || '';
	if (!apiKey) {
		throw new FileCompressionError(
			'FIREWORKS_API_KEY environment variable not set',
			'API_ERROR',
			{ missingEnvVar: 'FIREWORKS_API_KEY' }
		);
	}
}

/**
 * Parse JSON response, handling markdown code blocks
 */
function parseJsonResponse(text: string): Call2Response {
	let jsonText = text.trim();

	// Try to extract JSON from markdown code blocks
	const jsonCodeMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonCodeMatch) {
		jsonText = jsonCodeMatch[1].trim();
	}

	// Try to extract JSON object if there's other text around it
	const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
	if (jsonObjectMatch) {
		jsonText = jsonObjectMatch[0];
	}

	// Try to parse JSON
	let parsed: any;
	try {
		parsed = JSON.parse(jsonText);
	} catch (error) {
		// Log full details for debugging
		console.error('[parseJsonResponse] JSON parsing failed:');
		console.error('Raw API response:', text);
		console.error('Cleaned JSON text:', jsonText);
		console.error('Parse error:', (error as Error).message);

		throw new FileCompressionError(
			'Failed to parse API response as JSON',
			'JSON_PARSE_ERROR',
			{ rawText: text, parseError: (error as Error).message, attemptedJson: jsonText }
		);
	}

	// Validate structure
	if (!parsed.filename || !parsed.file_type || !parsed.description) {
		throw new FileCompressionError(
			'API response missing required fields: filename, file_type, or description',
			'VALIDATION_ERROR',
			{ received: parsed }
		);
	}

	// Validate file_type is valid enum value
	const validFileTypes: FileType[] = ['pdf', 'image', 'text', 'code', 'spreadsheet', 'other'];
	if (!validFileTypes.includes(parsed.file_type)) {
		throw new FileCompressionError(
			`Invalid file_type in response: ${parsed.file_type}`,
			'VALIDATION_ERROR',
			{ invalidType: parsed.file_type, validTypes: validFileTypes }
		);
	}

	return {
		filename: parsed.filename,
		file_type: parsed.file_type,
		description: parsed.description
	};
}

/**
 * Make API call to Fireworks with given prompt
 */
async function callFireworksAPI(
	systemPrompt: string,
	userContent: string,
	model: string,
	maxTokens?: number
): Promise<string> {
	const apiKey = process.env.FIREWORKS_API_KEY || '';

	const fireworks = new OpenAI({
		baseURL: 'https://api.fireworks.ai/inference/v1',
		apiKey: apiKey
	});

	try {
		const response = await fireworks.chat.completions.create({
			model: model,
			messages: [
				{
					role: 'system',
					content: systemPrompt
				},
				{
					role: 'user',
					content: userContent
				}
			],
			temperature: TEMPERATURE,
			max_tokens: maxTokens || MAX_TOKENS_CONFIG
		});

		const content = response.choices[0]?.message?.content;
		if (!content) {
			throw new FileCompressionError(
				'API returned empty response',
				'API_ERROR',
				{ response }
			);
		}

		return content;
	} catch (error: any) {
		// Check for rate limiting
		if (error.status === 429) {
			throw new FileCompressionError(
				'Fireworks API rate limit exceeded',
				'RATE_LIMIT',
				{ originalError: error.message }
			);
		}

		// Check for auth errors
		if (error.status === 401 || error.status === 403) {
			throw new FileCompressionError(
				'Fireworks API authentication failed',
				'API_ERROR',
				{ status: error.status, originalError: error.message }
			);
		}

		// Generic API error
		throw new FileCompressionError(
			`Fireworks API call failed: ${error.message}`,
			'API_ERROR',
			{ originalError: error.message, status: error.status }
		);
	}
}

// ============================================================================
// MAIN COMPRESSION FUNCTION
// ============================================================================

/**
 * Compress a single file chunk using Artisan Cut technique via Fireworks AI
 *
 * This function handles both Chunk 0 (file overview) and detail chunks (1+) by
 * routing to different prompts and token limits based on chunk index.
 *
 * Chunk 0 (Overview):
 * - Uses CHUNK_0_COMPRESSION_PROMPT (metadata-focused)
 * - Uses CHUNK_0_CALL_2B_PROMPT for verification
 * - Max tokens: 150 (concise metadata)
 * - Purpose: Make file discoverable as entity
 *
 * Detail Chunks (1+):
 * - Uses MODIFIED_CALL_2A_PROMPT (detail-focused)
 * - Uses MODIFIED_CALL_2B_PROMPT for verification
 * - Max tokens: 250 (preserve content)
 * - Purpose: Capture specific content
 *
 * Flow:
 * 1. Validate environment and input
 * 2. Select prompts based on chunk index (0 vs 1+)
 * 3. Call 2A: Initial compression
 * 4. Call 2B: Verification and refinement
 * 5. Return ChunkCompressionResult with chunk index
 *
 * @param input - Chunk compression input with chunk text, index, total chunks, filename, and file type
 * @returns Chunk compression result with filename, file type, description, and chunk index
 * @throws FileCompressionError - For validation, API, or parsing errors
 */
export async function compressChunk(input: ChunkCompressionInput): Promise<ChunkCompressionResult> {
	// Validate environment first
	validateEnvironment();

	// Validate input
	validateChunkInput(input);

	// Read selected compression model from user_settings table
	const { data: settings } = await supabase
		.from('user_settings')
		.select('selected_compression_model')
		.single();

	const compressionModel = settings?.selected_compression_model || 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507';

	// Select prompts based on chunk index
	const call2aPrompt = input.chunkIndex === 0
		? CALL3A_PROMPT           // Metadata-focused (Chunk 0 overview)
		: MODIFIED_CALL2A_PROMPT;  // Detail-focused (Chunk 1+)

	const call2bPrompt = input.chunkIndex === 0
		? CALL3B_PROMPT
		: MODIFIED_CALL2B_PROMPT;

	// Select max tokens based on chunk index
	const maxTokens = input.chunkIndex === 0
		? MAX_TOKENS_CHUNK_0  // 150: concise metadata
		: MAX_TOKENS_DETAIL;  // 250: preserve content

	let call2aResponse: Call2Response;
	let call2bResponse: Call2Response;

	// Call 2A: Initial compression
	try {
		const userContent = `File: ${input.filename} (Chunk ${input.chunkIndex + 1}/${input.totalChunks})
File Type: ${input.fileType}

${input.chunkText}`;

		console.log(`[compressChunk] Starting Call 2A for chunk ${input.chunkIndex} (${input.chunkIndex === 0 ? 'Chunk 0 overview' : 'detail chunk'})`);
		const call2aRaw = await callFireworksAPI(call2aPrompt, userContent, compressionModel, maxTokens);
		console.log(`[compressChunk] Call 2A completed for chunk ${input.chunkIndex}, parsing response...`);
		call2aResponse = parseJsonResponse(call2aRaw);
		console.log(`[compressChunk] Call 2A parsed successfully for chunk ${input.chunkIndex}`);
	} catch (error) {
		console.error(`[compressChunk] Call 2A failed for chunk ${input.chunkIndex}:`, error);
		if (error instanceof FileCompressionError) {
			throw error;
		}
		throw new FileCompressionError(
			'Call 2A processing failed',
			'UNKNOWN_ERROR',
			{ error: (error as Error).message }
		);
	}

	// Call 2B: Verification
	try {
		const userContent = JSON.stringify(call2aResponse);
		const call2bRaw = await callFireworksAPI(call2bPrompt, userContent, compressionModel, maxTokens);
		call2bResponse = parseJsonResponse(call2bRaw);
	} catch (error) {
		if (error instanceof FileCompressionError) {
			throw error;
		}
		throw new FileCompressionError(
			'Call 2B processing failed',
			'UNKNOWN_ERROR',
			{ error: (error as Error).message }
		);
	}

	// Return result with chunk index
	return {
		filename: call2bResponse.filename,
		fileType: call2bResponse.file_type,
		description: call2bResponse.description,
		chunkIndex: input.chunkIndex,
		call2aResponse: call2aResponse,
		call2bResponse: call2bResponse
	};
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export prompts for use in file-chunker.ts and other modules
export {
	CALL3A_PROMPT,
	CALL3B_PROMPT,
	MODIFIED_CALL2A_PROMPT,
	MODIFIED_CALL2B_PROMPT
};

// Already exported above:
// - FileCompressionError (class)
// - ChunkCompressionInput (interface)
// - ChunkCompressionResult (interface)
// - Call2Response (interface)
// - compressChunk (function)
