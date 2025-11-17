import OpenAI from 'openai';
import type { FileType } from './file-extraction';
import { generateEmbedding } from './vectorization';
import { FILE_MODEL, MAX_TOKENS } from '$lib/config/models';
import { jsonrepair } from 'jsonrepair';

// ============================================================================
// CONSTANTS
// ============================================================================

/** API Model Configuration */
const MODEL_NAME = FILE_MODEL;

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

/**
 * System prompt for Call 3A: File Overview + Logical Chunking
 * Used for new combined approach that generates both in single call
 */
const CALL_3A_PROMPT = `FILE OVERVIEW AND LOGICAL CHUNKING

You will receive a complete file. Your task has TWO parts:

1. Create a file-level overview for discoverability (Chunk 0)
2. Divide the file into logical chunks for detailed processing

## PART 1: FILE OVERVIEW

CRITICAL: Users search for files by saying "that interview transcript", "the business plan I shared", "the email thread about X". Your description must enable this discovery.

TARGET LENGTH: Maximum 300 words for the overview.

PRESERVE:
- Document type (interview, business plan, email thread, research paper, meeting notes, transcript, analysis, etc.)
- Participants/authors (names, roles, organizations if mentioned)
- Main themes and topics (high-level only, NOT detailed content)
- Date/time context (if mentioned)
- Document purpose/context (why this document exists)
- Overall structure (sections, format, conversation flow)
- Key entities at document level (companies, products mentioned)

REMOVE:
- Detailed content from specific sections
- Granular tactical details (those belong in detail chunks)
- Specific quotes or passages
- Background explanations
- Meta-commentary ("This document contains...")
- Obvious qualifiers ("approximately", "roughly")
- Verbose prose

## PART 2: LOGICAL CHUNKING

Divide the file into logical chunks based on natural sub-topic boundaries.

Each chunk will be processed separately to create a high-signal/low-noise artisan cut. For this to work well, chunks must be:
- Large enough to contain complete thoughts and context
- Small enough to process effectively (target: 300-800 words per chunk)
- Bounded by natural topic shifts, not arbitrary splits

Think of chunking at the sub-chapter or sub-topic level:
- If the file has chapters, chunk by sub-chapters
- Look for shifts in focus, not just new paragraphs
- Each chunk should be coherent enough to stand alone for processing

CHUNKING RULES:
- Target 300-800 words per chunk (flexible based on natural boundaries)
- Word indices are 0-based
- Chunks must cover entire file with no gaps or overlaps
- chunk_number starts at 1 and increments sequentially

## Output Format

Return ONLY a JSON object:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "overview": "[your compressed file-level overview here]",
  "chunks": [
    {
      "chunk_number": 1,
      "start_word": <word position>,
      "end_word": <word position>
    },
    {
      "chunk_number": 2,
      "start_word": <word position>,
      "end_word": <word position>
    }
  ]
}`;

/**
 * System prompt for Call 3B: Verification of Call 3A output
 */
const CALL_3B_PROMPT = `You received the following instruction set and generated a JSON output:

<earlier-instruction-set>
FILE OVERVIEW AND LOGICAL CHUNKING

You will receive a complete file. Your task has TWO parts:

1. Create a file-level overview for discoverability (Chunk 0)
2. Divide the file into logical chunks for detailed processing

## PART 1: FILE OVERVIEW

CRITICAL: Users search for files by saying "that interview transcript", "the business plan I shared", "the email thread about X". Your description must enable this discovery.

PRESERVE:
- Document type (interview, business plan, email thread, research paper, meeting notes, transcript, analysis, etc.)
- Participants/authors (names, roles, organizations if mentioned)
- Main themes and topics (high-level only, NOT detailed content)
- Date/time context (if mentioned)
- Document purpose/context (why this document exists)
- Overall structure (sections, format, conversation flow)
- Key entities at document level (companies, products mentioned)

REMOVE:
- Detailed content from specific sections
- Granular tactical details (those belong in detail chunks)
- Specific quotes or passages
- Background explanations
- Meta-commentary ("This document contains...")
- Obvious qualifiers ("approximately", "roughly")
- Verbose prose

## PART 2: LOGICAL CHUNKING

Divide the file into logical chunks based on natural sub-topic boundaries.

Each chunk will be processed separately to create a high-signal/low-noise artisan cut. For this to work well, chunks must be:
- Large enough to contain complete thoughts and context
- Small enough to process effectively (target: 300-800 words per chunk)
- Bounded by natural topic shifts, not arbitrary splits

Think of chunking at the sub-chapter or sub-topic level:
- If the file has chapters, chunk by sub-chapters
- Look for shifts in focus, not just new paragraphs
- Each chunk should be coherent enough to stand alone for processing

CHUNKING RULES:
- Target 300-800 words per chunk (flexible based on natural boundaries)
- Word indices are 0-based
- Chunks must cover entire file with no gaps or overlaps
- chunk_number starts at 1 and increments sequentially

## Output Format

Return ONLY a JSON object:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "overview": "[your compressed file-level overview here]",
  "chunks": [
    {
      "chunk_number": 1,
      "start_word": <word position>,
      "end_word": <word position>
    },
    {
      "chunk_number": 2,
      "start_word": <word position>,
      "end_word": <word position>
    }
  ]
}
</earlier-instruction-set>

<new-instruction-set>

I'm giving you back your response. Improve it. Don't mention that you are doing a review. Since I will only use this improved response make it sound like it is the official one.

## VERIFY OVERVIEW QUALITY:

Is the filename exact and correct?
Is the file_type accurate?
Is the overview concise (maximum 300 words)?
Is the overview well crafted for discoverability? Would I be able to ask "hey, remember that interview I shared?" or "remember the pitch deck we were going through?" and have you find this file?
Did you capture file-level metadata (document type, participants, main themes, date context, purpose)?
Did you preserve high-level themes without detailed content?
Did you remove granular tactical details that belong in detail chunks?

## VERIFY CHUNK BOUNDARIES:

Do chunks cover the entire file with no gaps or overlaps?
Are chunk boundaries at natural topic shifts (sub-chapters, sub-topics)?
Are chunks sized appropriately (300-800 words target, flexible for natural boundaries)?
Are word indices 0-based and sequential?
Do chunk_numbers start at 1 and increment properly?

Return the **complete improved** JSON in the same format.

</new-instruction-set>`;

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
			max_tokens: MAX_TOKENS_OVERVIEW,
			response_format: { type: 'json_object' } // Force JSON output
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
 * Generates all embeddings in parallel using Promise.all() for maximum performance.
 * Voyage AI API can handle 500 req/min, so 8-10 parallel requests are well within limits.
 *
 * @param sentences - Array of sentences
 * @returns Array of 1024-dimensional embeddings
 * @throws FileChunkerError if embedding generation fails
 */
async function generateSentenceEmbeddings(sentences: string[]): Promise<number[][]> {
	try {
		// Generate all embeddings in parallel
		const embeddingPromises = sentences.map(sentence => generateEmbedding(sentence));
		const embeddings = await Promise.all(embeddingPromises);
		return embeddings;
	} catch (error) {
		// Note: Promise.all() fails fast - if any embedding fails, all fail
		// This matches current behavior (fail on first error)
		throw new FileChunkerError(
			`Failed to generate embeddings: ${error instanceof Error ? error.message : String(error)}`,
			'EMBEDDING_ERROR',
			{ originalError: error }
		);
	}
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
// NEW COMBINED APPROACH (Call 3A + 3B)
// ============================================================================

/**
 * Generate file overview AND logical chunks using Call 3A + 3B
 *
 * This is the new unified approach that replaces separate overview and semantic chunking.
 * Makes a single pair of LLM calls (Call 3A + Call 3B) to get both outputs.
 *
 * Flow:
 * 1. Send full file to Call 3A (overview + chunking prompt)
 * 2. Parse JSON response
 * 3. Send to Call 3B for verification and improvement
 * 4. Parse verified JSON
 * 5. Extract chunks based on word positions
 * 6. Return overview + chunks
 *
 * @param text - Full file text
 * @param filename - Original filename
 * @param fileType - Classified file type
 * @returns Object with overview text and chunk array
 * @throws FileChunkerError if API call or parsing fails
 */
export async function generateOverviewAndChunks(
	text: string,
	filename: string,
	fileType: FileType
): Promise<{ overview: string; chunks: string[] }> {
	// Validate input
	if (!text || text.trim().length === 0) {
		throw new FileChunkerError(
			'Cannot generate overview and chunks: text is empty',
			'EMPTY_TEXT',
			{ filename }
		);
	}

	// Build user prompt for Call 3A
	const wordCount = countWords(text);
	const userPrompt = `Filename: ${filename}
Type: ${fileType}
Total length: ${wordCount} words

Full file text:
${text}`;

	// Call 3A: Generate overview + chunk boundaries
	let call3AResponse: string;
	try {
		call3AResponse = await callFireworksAPI(CALL_3A_PROMPT, userPrompt);
	} catch (error) {
		if (error instanceof FileChunkerError) {
			throw error;
		}
		throw new FileChunkerError(
			`Call 3A failed for ${filename}: ${error instanceof Error ? error.message : String(error)}`,
			'API_ERROR',
			{ filename, fileType, wordCount, error }
		);
	}

	// Parse Call 3A JSON
	let call3AData: any;
	try {
		call3AData = parseJSON(call3AResponse);
	} catch (error) {
		throw new FileChunkerError(
			`Call 3A returned invalid JSON for ${filename}: ${error instanceof Error ? error.message : String(error)}`,
			'API_ERROR',
			{ filename, response: call3AResponse.substring(0, 500) }
		);
	}

	// Call 3B: Verify and improve
	const call3BUserPrompt = `Original file:
${text}

Your earlier response:
${call3AResponse}`;

	let call3BResponse: string;
	try {
		call3BResponse = await callFireworksAPI(CALL_3B_PROMPT, call3BUserPrompt);
	} catch (error) {
		if (error instanceof FileChunkerError) {
			throw error;
		}
		throw new FileChunkerError(
			`Call 3B failed for ${filename}: ${error instanceof Error ? error.message : String(error)}`,
			'API_ERROR',
			{ filename, error }
		);
	}

	// Parse Call 3B JSON (final verified version)
	let finalData: any;
	try {
		finalData = parseJSON(call3BResponse);
	} catch (error) {
		throw new FileChunkerError(
			`Call 3B returned invalid JSON for ${filename}: ${error instanceof Error ? error.message : String(error)}`,
			'API_ERROR',
			{ filename, response: call3BResponse.substring(0, 500) }
		);
	}

	// Validate response structure
	if (!finalData.overview || typeof finalData.overview !== 'string') {
		throw new FileChunkerError(
			`Invalid overview in response for ${filename}`,
			'VALIDATION_ERROR',
			{ finalData }
		);
	}

	if (!Array.isArray(finalData.chunks)) {
		throw new FileChunkerError(
			`Invalid chunks array in response for ${filename}`,
			'VALIDATION_ERROR',
			{ finalData }
		);
	}

	// Extract chunks based on word positions
	const words = text.split(/\s+/);
	const chunks: string[] = [];

	// Normalize chunk definitions to fix LLM schema inconsistencies
	console.log('[generateOverviewAndChunks] Normalizing chunk definitions...');
	for (let i = 0; i < finalData.chunks.length; i++) {
		const chunk = finalData.chunks[i];

		// Fix: LLM sometimes uses "end" instead of "end_word" for last chunk
		if ('end' in chunk && !('end_word' in chunk)) {
			console.log(`[generateOverviewAndChunks] Fixing chunk ${i + 1}: "end" -> "end_word"`);
			chunk.end_word = chunk.end;
			delete chunk.end;
		}

		// Fix: LLM sometimes uses null for last chunk's end_word
		if (chunk.end_word === null || chunk.end_word === undefined) {
			console.log(`[generateOverviewAndChunks] Fixing chunk ${i + 1}: end_word was ${chunk.end_word}, setting to ${words.length - 1}`);
			chunk.end_word = words.length - 1;
		}

		// Fix: LLM sometimes uses 1-based indexing (end_word >= words.length)
		if (chunk.end_word >= words.length) {
			console.log(`[generateOverviewAndChunks] Fixing chunk ${i + 1}: end_word was ${chunk.end_word}, clamping to ${words.length - 1}`);
			chunk.end_word = words.length - 1;
		}
	}

	// Filter out phantom chunks with null/undefined start_word
	const originalChunkCount = finalData.chunks.length;
	finalData.chunks = finalData.chunks.filter((chunk, i) => {
		if (chunk.start_word === null || chunk.start_word === undefined) {
			console.log(`[generateOverviewAndChunks] Removing phantom chunk ${i + 1}: start_word is ${chunk.start_word}`);
			return false;
		}
		return true;
	});

	if (finalData.chunks.length < originalChunkCount) {
		console.log(`[generateOverviewAndChunks] Removed ${originalChunkCount - finalData.chunks.length} phantom chunk(s)`);
	}

	console.log('[generateOverviewAndChunks] ===== CHUNK VALIDATION DEBUG =====');
	console.log('[generateOverviewAndChunks] File:', filename);
	console.log('[generateOverviewAndChunks] Total words in file:', words.length);
	console.log('[generateOverviewAndChunks] Total chunks from LLM:', originalChunkCount);
	console.log('[generateOverviewAndChunks] Total chunks after filtering:', finalData.chunks.length);
	console.log('[generateOverviewAndChunks] Normalized chunk definitions:', JSON.stringify(finalData.chunks, null, 2));
	console.log('[generateOverviewAndChunks] =====================================');

	for (const chunkDef of finalData.chunks) {
		const { start_word, end_word } = chunkDef;

		// Validate indices
		if (typeof start_word !== 'number' || typeof end_word !== 'number') {
			console.error('[generateOverviewAndChunks] Invalid chunk definition:', chunkDef);
			console.error('[generateOverviewAndChunks] start_word type:', typeof start_word);
			console.error('[generateOverviewAndChunks] end_word type:', typeof end_word);
			throw new FileChunkerError(
				`Invalid chunk indices for ${filename}`,
				'VALIDATION_ERROR',
				{ chunkDef }
			);
		}

		if (start_word < 0 || end_word >= words.length || start_word > end_word) {
			console.error('[generateOverviewAndChunks] OUT OF RANGE ERROR!');
			console.error('[generateOverviewAndChunks] start_word:', start_word);
			console.error('[generateOverviewAndChunks] end_word:', end_word);
			console.error('[generateOverviewAndChunks] totalWords:', words.length);
			console.error('[generateOverviewAndChunks] Condition checks:');
			console.error('[generateOverviewAndChunks]   start_word < 0:', start_word < 0);
			console.error('[generateOverviewAndChunks]   end_word >= words.length:', end_word >= words.length);
			console.error('[generateOverviewAndChunks]   start_word > end_word:', start_word > end_word);
			throw new FileChunkerError(
				`Chunk indices out of range for ${filename}`,
				'VALIDATION_ERROR',
				{ start_word, end_word, totalWords: words.length }
			);
		}

		// Extract chunk text (inclusive end)
		const chunkWords = words.slice(start_word, end_word + 1);
		const chunkText = chunkWords.join(' ');
		chunks.push(chunkText);
	}

	// Verify chunks cover entire file
	if (chunks.length === 0) {
		throw new FileChunkerError(
			`No chunks generated for ${filename}`,
			'VALIDATION_ERROR',
			{ finalData }
		);
	}

	return {
		overview: finalData.overview,
		chunks
	};
}

/**
 * Parse JSON from LLM response
 *
 * Handles <think> tags (Qwen3 includes thinking in response)
 * Extracts JSON from markdown code blocks if present
 *
 * @param response - Raw LLM response text
 * @returns Parsed JSON object
 * @throws Error if JSON parsing fails
 */
function parseJSON(response: string): any {
	let cleaned = response.trim();

	// Remove <think> tags if present
	const thinkingMatch = cleaned.match(/<think>[\s\S]*?<\/think>\s*([\s\S]*)/);
	if (thinkingMatch) {
		cleaned = thinkingMatch[1].trim();
	}

	// Extract JSON from markdown code blocks if present
	const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	if (codeBlockMatch) {
		cleaned = codeBlockMatch[1].trim();
	}

	// Attempt to parse normally first
	try {
		return JSON.parse(cleaned);
	} catch (parseError) {
		// If normal parsing fails, attempt JSON repair
		console.log('[parseJSON] Initial parse failed, attempting repair...');
		console.log('[parseJSON] Original error:', parseError.message);
		console.log('[parseJSON] Original JSON (first 500 chars):', cleaned.substring(0, 500));

		try {
			const repaired = jsonrepair(cleaned);
			console.log('[parseJSON] Repaired JSON (first 500 chars):', repaired.substring(0, 500));
			const result = JSON.parse(repaired);
			console.log('[parseJSON] ✓ Repair successful!');
			return result;
		} catch (repairError) {
			// If repair also fails, throw repair error (more useful than original)
			console.error('[parseJSON] ✗ Repair failed:', repairError.message);
			console.error('[parseJSON] Repaired JSON that failed:', repaired?.substring(0, 500));
			throw repairError;
		}
	}
}

// ============================================================================
// EXPORTS
// ============================================================================

// Main functions exported above:
// - generateFileOverview (function)
// - chunkTextBySemantic (function)
// - generateOverviewAndChunks (function) - NEW
// - FileChunkerError (class)
// - ChunkingInput (interface)
// - ChunkingOutput (interface)
