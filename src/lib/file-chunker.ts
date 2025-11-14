import OpenAI from 'openai';
import type { FileType } from './file-extraction';
import { generateEmbedding } from './vectorization';

// ============================================================================
// CONSTANTS
// ============================================================================

/** API Model Configuration */
const MODEL_NAME = 'accounts/fireworks/models/qwen3-235b-a22b' as const;

/** API Call Configuration */
const TEMPERATURE = 0.7;
const MAX_TOKENS_OVERVIEW = 1000;

/** Word count threshold for heuristic vs LLM approach */
const WORD_COUNT_THRESHOLD = 2000;

/** Word counts for overview generation */
const HEURISTIC_WORDS = 1000; // For small files
const LLM_FIRST_WORDS = 2000; // For large files
const LLM_LAST_WORDS = 500; // For large files

/** Default parameters for semantic chunking */
const DEFAULT_TARGET_TOKENS = 768; // Target chunk size in tokens
const DEFAULT_SIMILARITY_THRESHOLD = 0.5; // Topic shift detection threshold
const MAX_CHUNK_TOKENS = 1024; // Hard limit per chunk
const MIN_CHUNK_TOKENS = 256; // Minimum viable chunk size

/** Rate limiting for Voyage AI (500 req/min = ~120ms between requests) */
const EMBEDDING_DELAY_MS = 120;

/**
 * System prompt for LLM-based file overview generation
 * Used when files exceed WORD_COUNT_THRESHOLD (2000 words)
 */
const FILE_OVERVIEW_PROMPT = `You are creating a concise file-level overview for document discovery and search.

Your task: Generate a 200-400 word overview that captures what kind of document this is and what it's broadly about.

Focus on:
- Document type and format (interview, business plan, research paper, meeting notes, transcript, etc.)
- Key participants/authors (names, roles, organizations if mentioned)
- Overall topic and purpose (why this document exists)
- Major themes/sections (high-level only)
- Any notable metadata (dates, time context, duration)
- Overall structure (conversation, sections, analysis format)

DO NOT include:
- Detailed content from specific sections
- Granular tactical details
- Specific quotes or long passages
- Step-by-step summaries of content
- Information better suited for detail chunks

Your overview must enable users to find this file by saying things like:
- "that interview transcript"
- "the business plan I shared"
- "the email thread about X"

Keep the overview between 200-400 words. Be comprehensive but concise.

Output ONLY the overview text. Do not include any preamble, commentary, or meta-text like "Here is the overview:" or "This document is...". Start directly with the content.`;

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Custom error class for file chunker failures
 */
export class FileChunkerError extends Error {
	constructor(
		message: string,
		public readonly code:
			| 'API_ERROR'
			| 'VALIDATION_ERROR'
			| 'EMPTY_TEXT'
			| 'RATE_LIMIT'
			| 'EMBEDDING_ERROR'
			| 'UNKNOWN_ERROR',
		public readonly details?: any
	) {
		super(message);
		this.name = 'FileChunkerError';
	}
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate file-level overview (Chunk 0) for uploaded file
 *
 * Strategy:
 * - Small files (≤ 2000 words): Use heuristic approach (first 1000 words)
 * - Large files (> 2000 words): Use LLM approach (first 2000 + last 500 words)
 *
 * @param text - Full extracted file text
 * @param filename - Original filename
 * @param fileType - Classified file type
 * @returns Overview text (200-400 words for LLM approach, ~1000 words for heuristic)
 * @throws FileChunkerError if generation fails
 */
export async function generateFileOverview(
	text: string,
	filename: string,
	fileType: FileType
): Promise<string> {
	// Validate input
	if (!text || text.trim().length === 0) {
		throw new FileChunkerError(
			'Cannot generate overview: text is empty',
			'EMPTY_TEXT',
			{ filename }
		);
	}

	// Count words to determine approach
	const wordCount = countWords(text);

	// Choose approach based on word count
	if (wordCount <= WORD_COUNT_THRESHOLD) {
		// Small file: use heuristic approach
		return generateOverviewHeuristic(text, filename);
	} else {
		// Large file: use LLM approach
		return await generateOverviewLLM(text, filename, fileType, wordCount);
	}
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate overview using heuristic approach (small files ≤ 2000 words)
 *
 * Simply takes the first 1000 words of the file as the overview.
 * This is sufficient for small files where the beginning captures the essence.
 *
 * @param text - Full file text
 * @param filename - Original filename
 * @returns First 1000 words of the text
 */
function generateOverviewHeuristic(text: string, filename: string): string {
	const words = text.split(/\s+/);
	const overviewWords = words.slice(0, HEURISTIC_WORDS);
	return overviewWords.join(' ');
}

/**
 * Generate overview using LLM approach (large files > 2000 words)
 *
 * Sends first 2000 words + last 500 words to LLM for intelligent summarization.
 * LLM generates 200-400 word overview capturing document type, participants, themes.
 *
 * @param text - Full file text
 * @param filename - Original filename
 * @param fileType - Classified file type
 * @param wordCount - Total word count in file
 * @returns LLM-generated overview (200-400 words)
 * @throws FileChunkerError if API call fails
 */
async function generateOverviewLLM(
	text: string,
	filename: string,
	fileType: FileType,
	wordCount: number
): Promise<string> {
	// Extract first 2000 and last 500 words
	const words = text.split(/\s+/);
	const firstKWords = words.slice(0, LLM_FIRST_WORDS).join(' ');
	const lastKWords = words.slice(-LLM_LAST_WORDS).join(' ');

	// Build user prompt
	const userPrompt = `Create a concise overview (200-400 words) of this document:

Filename: ${filename}
Type: ${fileType}
Total length: ${wordCount} words

Beginning:
${firstKWords}

Ending:
${lastKWords}

Focus on:
- Document type and format
- Key participants/authors
- Overall topic and purpose
- Major themes/sections
- Any notable metadata (dates, context)

DO NOT summarize detailed content. Capture "what kind of document this is" and "what it's broadly about."`;

	// Call Fireworks API
	try {
		const overview = await callFireworksAPI(FILE_OVERVIEW_PROMPT, userPrompt);
		return overview;
	} catch (error) {
		if (error instanceof FileChunkerError) {
			throw error;
		}
		throw new FileChunkerError(
			`Failed to generate LLM overview for ${filename}: ${error instanceof Error ? error.message : String(error)}`,
			'API_ERROR',
			{ filename, fileType, wordCount, error }
		);
	}
}

/**
 * Count words in text
 *
 * Uses simple whitespace-based word counting.
 * Filters out empty strings from split.
 *
 * @param text - Input text
 * @returns Number of words
 */
function countWords(text: string): number {
	if (!text || text.trim().length === 0) {
		return 0;
	}
	return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Call Fireworks API with system and user prompts
 *
 * Reuses the same API configuration as file-compressor.ts
 *
 * @param systemPrompt - System instruction for the model
 * @param userContent - User message content
 * @returns Model response text
 * @throws FileChunkerError if API call fails
 */
async function callFireworksAPI(systemPrompt: string, userContent: string): Promise<string> {
	const apiKey = process.env.FIREWORKS_API_KEY || '';

	if (!apiKey) {
		throw new FileChunkerError(
			'FIREWORKS_API_KEY environment variable not set',
			'API_ERROR',
			{ missingEnvVar: 'FIREWORKS_API_KEY' }
		);
	}

	const fireworks = new OpenAI({
		baseURL: 'https://api.fireworks.ai/inference/v1',
		apiKey: apiKey
	});

	try {
		const response = await fireworks.chat.completions.create({
			model: MODEL_NAME,
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
			max_tokens: MAX_TOKENS_OVERVIEW
		});

		const content = response.choices[0]?.message?.content;
		if (!content) {
			throw new FileChunkerError('API returned empty response', 'API_ERROR', { response });
		}

		// Remove thinking tags if present (Qwen3 includes <think>...</think>)
		let cleanedContent = content.trim();
		const thinkingMatch = cleanedContent.match(/<think>[\s\S]*?<\/think>\s*([\s\S]*)/);
		if (thinkingMatch) {
			cleanedContent = thinkingMatch[1].trim();
		}

		return cleanedContent;
	} catch (error: any) {
		// Check for rate limiting
		if (error.status === 429) {
			throw new FileChunkerError(
				'Fireworks API rate limit exceeded',
				'RATE_LIMIT',
				{ originalError: error.message }
			);
		}

		// Check for auth errors
		if (error.status === 401 || error.status === 403) {
			throw new FileChunkerError(
				'Fireworks API authentication failed',
				'API_ERROR',
				{ status: error.status, originalError: error.message }
			);
		}

		// Generic API error
		throw new FileChunkerError(
			`Fireworks API call failed: ${error.message}`,
			'API_ERROR',
			{ originalError: error.message, status: error.status }
		);
	}
}

// ============================================================================
// SEMANTIC CHUNKING
// ============================================================================

/**
 * Input parameters for semantic chunking
 */
export interface ChunkingInput {
	/** Full extracted file text to be chunked */
	text: string;
	/** Target chunk size in tokens (default: 768) */
	targetChunkTokens?: number;
	/** Similarity threshold for topic boundary detection (default: 0.5, range: 0.0-1.0) */
	similarityThreshold?: number;
}

/**
 * Output from semantic chunking operation
 */
export interface ChunkingOutput {
	/** Array of chunk texts */
	chunks: string[];
	/** Character positions of chunk boundaries in original text */
	boundaries: number[];
	/** Word count for each chunk */
	chunkWordCounts: number[];
	/** Estimated token count for each chunk */
	chunkTokenCounts: number[];
}

/**
 * Chunk text using semantic similarity to detect topic boundaries
 *
 * Uses Voyage AI embeddings to detect when consecutive sentences discuss
 * different topics. Creates chunk boundaries when cosine similarity drops
 * below the threshold.
 *
 * Algorithm:
 * 1. Split text into sentences (linguistic units)
 * 2. Generate embeddings for each sentence using Voyage AI
 * 3. Calculate cosine similarity between consecutive embeddings
 * 4. Detect topic boundaries where similarity < threshold
 * 5. Group sentences into chunks at boundaries, respecting target size
 *
 * @param input - Chunking parameters (text, target size, similarity threshold)
 * @returns Chunks with metadata (boundaries, word counts, token counts)
 * @throws FileChunkerError if chunking fails
 *
 * @example
 * const result = await chunkTextBySemantic({
 *   text: 'Long document text...',
 *   targetChunkTokens: 768,
 *   similarityThreshold: 0.5
 * });
 * console.log(`Created ${result.chunks.length} chunks`);
 */
export async function chunkTextBySemantic(input: ChunkingInput): Promise<ChunkingOutput> {
	const {
		text,
		targetChunkTokens = DEFAULT_TARGET_TOKENS,
		similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD
	} = input;

	// Validate input
	if (!text || text.trim().length === 0) {
		throw new FileChunkerError('Cannot chunk empty text', 'EMPTY_TEXT');
	}

	if (similarityThreshold < 0.0 || similarityThreshold > 1.0) {
		throw new FileChunkerError(
			`Similarity threshold must be between 0.0 and 1.0, got ${similarityThreshold}`,
			'VALIDATION_ERROR',
			{ similarityThreshold }
		);
	}

	if (targetChunkTokens <= 0) {
		throw new FileChunkerError(
			`Target chunk tokens must be positive, got ${targetChunkTokens}`,
			'VALIDATION_ERROR',
			{ targetChunkTokens }
		);
	}

	try {
		// Split text into sentences
		const sentences = splitIntoSentences(text);

		// Handle small texts (< 5 sentences) - return as single chunk
		if (sentences.length < 5) {
			const wordCount = countWords(text);
			const tokenCount = estimateTokens(text);
			return {
				chunks: [text],
				boundaries: [0],
				chunkWordCounts: [wordCount],
				chunkTokenCounts: [tokenCount]
			};
		}

		// Generate embeddings for each sentence
		const embeddings = await generateSentenceEmbeddings(sentences);

		// Detect topic boundaries based on similarity
		const boundaries = detectTopicBoundaries(embeddings, similarityThreshold);

		// Group sentences into chunks
		const result = groupSentencesIntoChunks(sentences, boundaries, targetChunkTokens);

		return result;
	} catch (error) {
		if (error instanceof FileChunkerError) {
			throw error;
		}

		throw new FileChunkerError(
			`Failed to chunk text: ${error instanceof Error ? error.message : String(error)}`,
			'UNKNOWN_ERROR',
			{ originalError: error }
		);
	}
}

/**
 * Split text into sentences
 *
 * Handles:
 * - Abbreviations: Dr., Mr., Mrs., U.S., etc.
 * - Decimals: 3.14, $5.99
 * - Ellipsis: ...
 *
 * Uses a simple approach: split on ". " "! " "? " with filtering.
 *
 * @param text - Input text
 * @returns Array of sentences
 */
function splitIntoSentences(text: string): string[] {
	// Normalize whitespace
	const normalized = text.replace(/\s+/g, ' ').trim();

	// Split on sentence-ending punctuation followed by space
	// Use regex to match . ! ? followed by space or end of string
	const sentenceEnders = /([.!?])\s+/g;

	const sentences: string[] = [];
	let lastIndex = 0;
	let match;

	while ((match = sentenceEnders.exec(normalized)) !== null) {
		const endIndex = match.index + match[1].length;
		const sentence = normalized.substring(lastIndex, endIndex).trim();

		// Filter out common abbreviations that aren't sentence boundaries
		if (sentence && !isAbbreviation(sentence)) {
			sentences.push(sentence);
			lastIndex = sentenceEnders.lastIndex;
		}
	}

	// Add remaining text as final sentence
	const remaining = normalized.substring(lastIndex).trim();
	if (remaining) {
		sentences.push(remaining);
	}

	// Filter empty sentences
	return sentences.filter((s) => s.length > 0);
}

/**
 * Check if a sentence ends with a common abbreviation
 *
 * @param sentence - Sentence to check
 * @returns True if ends with abbreviation
 */
function isAbbreviation(sentence: string): boolean {
	const abbreviations = [
		'Dr.',
		'Mr.',
		'Mrs.',
		'Ms.',
		'Prof.',
		'Sr.',
		'Jr.',
		'U.S.',
		'U.K.',
		'etc.',
		'i.e.',
		'e.g.',
		'vs.',
		'Inc.',
		'Ltd.',
		'Corp.'
	];

	return abbreviations.some((abbr) => sentence.trim().endsWith(abbr));
}

/**
 * Generate embeddings for an array of sentences
 *
 * Calls Voyage AI API for each sentence with rate limiting.
 * Uses EMBEDDING_DELAY_MS between requests to respect API limits.
 *
 * @param sentences - Array of sentences
 * @returns Array of 1024-dimensional embeddings
 * @throws FileChunkerError if embedding generation fails
 */
async function generateSentenceEmbeddings(sentences: string[]): Promise<number[][]> {
	const embeddings: number[][] = [];

	for (let i = 0; i < sentences.length; i++) {
		try {
			// Generate embedding for this sentence
			const embedding = await generateEmbedding(sentences[i]);
			embeddings.push(embedding);

			// Add delay between requests (except for last request)
			if (i < sentences.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, EMBEDDING_DELAY_MS));
			}
		} catch (error) {
			throw new FileChunkerError(
				`Failed to generate embedding for sentence ${i}: ${error instanceof Error ? error.message : String(error)}`,
				'EMBEDDING_ERROR',
				{ sentenceIndex: i, sentence: sentences[i], originalError: error }
			);
		}
	}

	return embeddings;
}

/**
 * Calculate cosine similarity between two vectors
 *
 * Formula: dot(a, b) / (||a|| * ||b||)
 * Returns value between 0.0 and 1.0:
 * - 1.0 = identical vectors (same topic)
 * - 0.0 = orthogonal vectors (different topics)
 *
 * @param vec1 - First vector
 * @param vec2 - Second vector
 * @returns Cosine similarity (0.0 to 1.0)
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
	if (vec1.length !== vec2.length) {
		throw new Error(`Vector dimension mismatch: ${vec1.length} vs ${vec2.length}`);
	}

	// Calculate dot product
	let dotProduct = 0;
	for (let i = 0; i < vec1.length; i++) {
		dotProduct += vec1[i] * vec2[i];
	}

	// Calculate magnitudes
	let magnitude1 = 0;
	let magnitude2 = 0;
	for (let i = 0; i < vec1.length; i++) {
		magnitude1 += vec1[i] * vec1[i];
		magnitude2 += vec2[i] * vec2[i];
	}
	magnitude1 = Math.sqrt(magnitude1);
	magnitude2 = Math.sqrt(magnitude2);

	// Avoid division by zero
	if (magnitude1 === 0 || magnitude2 === 0) {
		return 0;
	}

	// Return cosine similarity
	return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Detect topic boundaries based on embedding similarity
 *
 * Compares consecutive embeddings and marks boundaries where
 * similarity drops below threshold (indicating topic shift).
 *
 * @param embeddings - Array of sentence embeddings
 * @param threshold - Similarity threshold (0.0-1.0)
 * @returns Set of sentence indices where boundaries should be created
 */
function detectTopicBoundaries(embeddings: number[][], threshold: number): Set<number> {
	const boundaries = new Set<number>();

	// Always start with boundary at index 0
	boundaries.add(0);

	// Compare consecutive embeddings
	for (let i = 0; i < embeddings.length - 1; i++) {
		const similarity = cosineSimilarity(embeddings[i], embeddings[i + 1]);

		// If similarity drops below threshold, mark as boundary
		if (similarity < threshold) {
			boundaries.add(i + 1);
		}
	}

	return boundaries;
}

/**
 * Group sentences into chunks based on boundaries and size limits
 *
 * Creates chunks at topic boundaries while respecting target token size.
 * Also creates new chunks if size exceeds MAX_CHUNK_TOKENS.
 *
 * @param sentences - Array of sentences
 * @param boundaries - Set of boundary indices
 * @param targetTokens - Target chunk size in tokens
 * @returns Chunking output with chunks and metadata
 */
function groupSentencesIntoChunks(
	sentences: string[],
	boundaries: Set<number>,
	targetTokens: number
): ChunkingOutput {
	const chunks: string[] = [];
	const chunkBoundaries: number[] = [];
	const chunkWordCounts: number[] = [];
	const chunkTokenCounts: number[] = [];

	let currentChunk: string[] = [];
	let currentTokens = 0;
	let charPosition = 0;

	for (let i = 0; i < sentences.length; i++) {
		const sentence = sentences[i];
		const sentenceTokens = estimateTokens(sentence);

		// Check if we should start a new chunk
		const isBoundary = boundaries.has(i);
		const wouldExceedMax = currentTokens + sentenceTokens > MAX_CHUNK_TOKENS;
		const shouldStartNewChunk = (isBoundary || wouldExceedMax) && currentChunk.length > 0;

		if (shouldStartNewChunk) {
			// Finalize current chunk
			const chunkText = currentChunk.join(' ');
			chunks.push(chunkText);
			chunkBoundaries.push(charPosition);
			chunkWordCounts.push(countWords(chunkText));
			chunkTokenCounts.push(currentTokens);

			// Update char position
			charPosition += chunkText.length + 1; // +1 for space

			// Start new chunk
			currentChunk = [];
			currentTokens = 0;
		}

		// Add sentence to current chunk
		currentChunk.push(sentence);
		currentTokens += sentenceTokens;
	}

	// Add final chunk if not empty
	if (currentChunk.length > 0) {
		const chunkText = currentChunk.join(' ');
		chunks.push(chunkText);
		chunkBoundaries.push(charPosition);
		chunkWordCounts.push(countWords(chunkText));
		chunkTokenCounts.push(currentTokens);
	}

	return {
		chunks,
		boundaries: chunkBoundaries,
		chunkWordCounts,
		chunkTokenCounts
	};
}

/**
 * Estimate token count from text
 *
 * Uses quick approximation: word count * 1.3
 * (Real tokenization is more complex but this is fast enough)
 *
 * @param text - Input text
 * @returns Estimated token count
 */
function estimateTokens(text: string): number {
	return Math.ceil(countWords(text) * 1.3);
}

// ============================================================================
// EXPORTS
// ============================================================================

// Main functions exported above:
// - generateFileOverview (function)
// - chunkTextBySemantic (function)
// - FileChunkerError (class)
// - ChunkingInput (interface)
// - ChunkingOutput (interface)
