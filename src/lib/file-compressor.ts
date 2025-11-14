import OpenAI from 'openai';
import type { FileType } from './file-extraction';

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

/** API Model Configuration */
const MODEL_NAME = 'accounts/fireworks/models/qwen3-235b-a22b' as const;

/** API Call Configuration */
const TEMPERATURE = 0.7;
const MAX_TOKENS = 2000; // Default fallback

/** Max tokens for chunk compression */
const MAX_TOKENS_CHUNK_0 = 150;  // Chunk 0: concise metadata
const MAX_TOKENS_DETAIL = 250;    // Detail chunks: preserve content

/** Validation constants */
const MAX_CONTENT_LENGTH = 100000;

/**
 * Modified Call 2A Prompt - Artisan Cut for Files
 * From system-prompts.md lines 310-424
 */
const MODIFIED_CALL_2A_PROMPT = `ARTISAN CUT FOR FILES

You will receive a file (PDF, image, text, code, spreadsheet, etc.) that I uploaded.

Apply the Artisan Cut to create a compressed file description.
You are a modern and powerful LLM model. Ask yourself: how can you describe this file in the fewest words possible such that ...

 - you keep everything that you could not infer back easily from fewer words.
 - you tightly condense everything that you could indeed infer back easily from fewer words.
  **Exception: Behavioral directives (HOW to act) are NOT easily inferable from role descriptions (WHAT you are)**
 - you remove everything that is honestly just noise.

Examples of information that you cannot infer back fully from fewer words:

- Business matters – decisions, negotiations, agreements, risks, numbers, timelines, financial data
- Strategic content – core thesis, unique insights, competitive analysis, action items
- Specific data – exact numbers, percentages, dollar amounts, dates, targets, metrics
- Key entities – people, companies, products, technologies mentioned
- Behavioral directives – HOW to act, not just WHAT you are
  - Tone modifiers: "powerful," "warm," "direct," "critical"
  - Behavioral adverbs: "critically evaluate" ≠ "evaluate"
  - Resource usage guidance: "wisely," "for your benefit," "truly help" (not just "use" or "help")
  - Addressing conventions: "call them Boss" ≠ "reports to Boss"
  - Communication style: "conversational" vs "formal" vs "irreverent"
  - Response patterns: "challenge assumptions" vs "support ideas"
  - Empowerment language: "give yourself permission" ≠ "permission to"
  - Interaction structure: "3-expert panel: Boss poses Qs, experts debate" ≠ "consultation" (HOW conversation flows)
  - Debate patterns: "Expert 2 rejects Expert 1 proposal" (contrarian thinking valued, not consensus)
- Critical decisions – what was chosen, rejected, why
- Terminology – exact phrasing of important statements, defined terms, branded concepts
- Emotional/psychological weight – shame, fear, self-rejection, urgency (context for future motivation)

Examples of information that you can easily infer back fully from fewer words:

- Generic descriptions that can be reduced to semantic labels
- Background context or widely known information
- Step-by-step explanations unless tied to strategic decisions
- Verbose prose that can be condensed to telegraphic form

Examples of information that is just pure noise:

- Qualifiers like "approximately," "roughly," "about," "seems like"
- Grammatical fillers and unnecessary transitions
- Meta-commentary like "This document contains..." or "The file shows..."
- Repetitions of information

Use punctuation symbols . , ; : - etc. heavily in generating your artisan cuts.

## File Type Guidelines

### PDFs (including Google Docs, Sheets, Slides converted to PDF)

Assume every PDF is strategically important - capture substance with artisan cut compression.

**If filename indicates Google file** (e.g., "Google Docs-...", "Google Sheets-...", "Google Slides-..."), state source type at start: "Google Sheets:" or "Google Slides:" or "Google Docs:"

Capture (compressed):
- Doc type, page count, structure
- Interaction format if applicable: panel Q&A, debate structure, conversational flow (HOW content organized)
- Core thesis/purpose: central argument, objective, problem solved, decision supported
- Critical data: numbers, %, $, dates, timelines, targets
- Strategic decisions: chosen, rejected, why (preserve rejection reasoning)
- Debate/contrarian views: Expert X rejects Y's proposal because Z (disagreement structure)
- Risks, mitigation strategies
- Competitive analysis: who, differentiation, strengths/weaknesses
- Financial: revenue, costs, margins, runway, breakeven
- Action items, next steps, responsibilities, deadlines
- For spreadsheets: table structure, headers, key data, formulas, trends
- Charts/graphs: axis labels, trends, key points
- Exact quotes for important statements, defined terms
- Implicit context: industry assumptions, unstated premises
- Emotional/psychological context: self-doubt, fear patterns, urgency drivers (motivation for future reference)

### Text Files (TXT, MD, CSV, JSON, etc.)

Assume critical information - artisan cut compression.

- File type, line/char count
- Purpose: problem solved, knowledge contained
- Critical info: concepts, definitions, procedures, decisions
- Specific values: config settings, URLs, endpoints (obfuscate sensitive data)
- Data: metrics, thresholds, limits, quotas
- Instructions: procedures, commands, workflows
- Requirements: specs, dependencies, prerequisites
- Warnings, caveats, edge cases
- Structure: sections, headings, hierarchies
- Terminology: exact phrasing, acronyms
- Cross-references: links to systems, docs, APIs

### Images (PNG, JPG, GIF, WebP, etc.)

- Visual elements: shapes, objects, people, scenes
- Text content: exact quotes
- Colors, layout, composition
- Style, aesthetic
- Technical details if visible

### Code Files (JS, TS, PY, etc.)

- Language
- Purpose: what code accomplishes
- Main components: functions, classes, modules
- Key logic: algorithms, operations
- Dependencies: libraries, imports
- Entry points: main functions, exports

### Spreadsheets (XLSX, CSV)

- Dimensions: rows × columns
- Headers: column names
- Data types per column
- Key values: notable data, totals, ranges
- Purpose: what it tracks/calculates

## Output Format

You MUST return a JSON object with this EXACT structure:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[your artisan cut compressed description here]"
}

CRITICAL RULES:
– Output ONLY the JSON object above.
– No additional text, analysis, or commentary.
– description must use artisan cut compression.
– filename must be exact.

## Anti-Patterns to Avoid:

❌ "Strategic consultation" → ✓ "3-expert panel: Boss poses Qs, experts debate"
❌ "Financial analysis shows..." → ✓ "$200M Vanta, $100M Drata ARR = reactive dashboards"
❌ "Discussed GTM approaches" → ✓ "Expert 1 proposes freemium PLG. Expert 2 rejects: dev≠buyer, not viral"
❌ "Explored marketing tactics" → ✓ "Kirby: auditor Trojan—partner firms 20% rev share, weaponize CFO math"
❌ Over-aggregating sequences → ✓ Preserve causal chains: "log exceptions→risk score→dashboard→moat"
❌ Compressing emotional weight → ✓ "Boss: self-rejection bias re startup viability" (psych context matters)`;

/**
 * Chunk 0 Compression Prompt - Metadata-focused for file-level overview
 * Used for the first chunk (chunk_index = 0) which makes files discoverable as entities
 */
const CHUNK_0_COMPRESSION_PROMPT = `ARTISAN CUT FOR FILE OVERVIEW (CHUNK 0)

You will receive the overview text for an uploaded file. This is Chunk 0 - the file-level overview that makes this file discoverable as an entity.

CRITICAL: Users search for files by saying "that interview transcript", "the business plan I shared", "the email thread about X". Your description must enable this discovery.

Your task: Extract file-level metadata and create a compressed overview that makes this file discoverable.

## What to Capture (Compressed)

PRESERVE:
- Document type (interview, business plan, email thread, research paper, meeting notes, transcript, analysis, etc.)
- Participants/authors (names, roles, organizations if mentioned)
- Main themes and topics (high-level only, NOT detailed content)
- Date/time context (if mentioned)
- Document purpose/context (why this document exists)
- Overall structure (sections, format, conversation flow)
- Key entities at document level (companies, products mentioned)

COMPRESS HEAVILY:
- Detailed content from specific sections
- Granular tactical details (those belong in detail chunks)
- Specific quotes or passages
- Background explanations
- Step-by-step content

REMOVE:
- Meta-commentary ("This document contains...")
- Obvious qualifiers ("approximately", "roughly")
- Verbose prose
- Derivable information

## Compression Target

200-400 characters maximum. Be extremely concise while preserving discoverability.

## Output Format

You MUST return a JSON object with this EXACT structure:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[your compressed overview here - 200-400 chars max]"
}

CRITICAL RULES:
- Output ONLY the JSON object above
- No additional text, analysis, or commentary
- description must focus on metadata and document-level information
- Description makes the file discoverable by its nature, not its detailed content
- Use heavy punctuation (: ; , -) for compression

## Examples

INPUT (small file overview):
"Interview with Dr. Sarah Chen, Mark Rodriguez, and Prof. James Liu about an AI-powered IT compliance startup. Discussion covers regulatory landscape (GDPR, HIPAA, SOC2), technical implementation challenges, market size analysis, and go-to-market strategy. Participants debate build vs. buy decisions and explore pricing models."

OUTPUT:
{
  "filename": "compliance-interview.md",
  "file_type": "text",
  "description": "Interview: 3 experts (Chen-CISO, Rodriguez-GRC, Liu-AI ethics) on AI compliance startup; topics: regulatory landscape (GDPR/HIPAA/SOC2), tech implementation, market sizing, GTM, pricing models"
}

INPUT (large file overview generated by LLM):
"File: Product Strategy 2024.pdf
Type: Business plan
Length: 8,500 words

This is a comprehensive product strategy document for FY2024. The document covers market positioning, competitive analysis of 12 SaaS players, detailed product roadmap across 4 quarters, pricing strategy evolution from $99/mo to usage-based model, technical architecture migration to microservices, hiring plan for 15 engineering roles, and fundraising timeline for Series A ($10M target, Q3 close)."

OUTPUT:
{
  "filename": "Product Strategy 2024.pdf",
  "file_type": "pdf",
  "description": "Business plan, 8.5K words: FY24 product strategy; market positioning, 12 SaaS competitors, 4Q roadmap, pricing evolution ($99→usage-based), microservices migration, 15 eng hires, Series A $10M Q3"
}

## Anti-Patterns to Avoid

❌ "This document discusses various aspects of..." → ✓ "Interview: 3 experts on X; topics: A, B, C"
❌ "A comprehensive analysis of market trends..." → ✓ "Market analysis: 5 trends, competitor positioning, whitespace"
❌ "The file contains detailed information about..." → ✓ "Email thread: co-founders debate pricing model; decision: freemium→paid-only"
❌ Including detailed content summaries → ✓ List major topics/themes only
❌ Verbose complete sentences → ✓ Telegraphic compression with heavy punctuation

Remember: Chunk 0 makes files discoverable as ENTITIES. Detail chunks (1+) capture specific CONTENT.`;

/**
 * Chunk 0 Call 2B Prompt - Verification of Chunk 0 compression
 * Ensures metadata and discoverability are preserved
 */
const CHUNK_0_CALL_2B_PROMPT = `Review the previous JSON output for Chunk 0 (file-level overview):

- Verify filename is exact and matches the input
- Verify file_type is one of: image|pdf|text|code|spreadsheet|other
- Verify description captures document type (interview, business plan, email, etc.)
- Verify description includes participants/authors if mentioned
- Verify description lists major themes/topics (high-level only)
- Verify description is 200-400 characters (NOT too long, NOT too short)
- Verify description makes file discoverable by its nature/type
- Verify description does NOT include detailed content (that belongs in detail chunks)
- Refine if needed to better match Chunk 0 goals

Return ONLY the improved JSON object with this exact structure:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[refined Chunk 0 overview - 200-400 chars]"
}

No additional text, analysis, or commentary.`;

/**
 * Modified Call 2B Prompt - Verification of Call 2A output (for detail chunks)
 * Adapted from standard Call 2B pattern for file verification
 */
const MODIFIED_CALL_2B_PROMPT = `Review the previous JSON output for accuracy and quality:

- Verify filename is exact and matches the input
- Verify file_type is one of: image|pdf|text|code|spreadsheet|other
- Verify description preserves all non-inferable information (numbers, dates, entities, decisions)
- Verify description applies artisan cut compression (removes verbose prose, noise, qualifiers)
- Verify description does not over-compress critical information
- Refine if needed to better match artisan cut principles

Return ONLY the improved JSON object with this exact structure:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[refined artisan cut compressed description]"
}

No additional text, analysis, or commentary.`;

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
 * Parse JSON response, handling markdown code blocks and thinking tags
 */
function parseJsonResponse(text: string): Call2Response {
	let jsonText = text.trim();

	// Remove thinking tags if present (Qwen3 includes <think>...</think>)
	const thinkingMatch = jsonText.match(/<think>[\s\S]*?<\/think>([\s\S]*)/);
	if (thinkingMatch) {
		jsonText = thinkingMatch[1].trim();
	}

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
	maxTokens?: number
): Promise<string> {
	const apiKey = process.env.FIREWORKS_API_KEY || '';

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
			max_tokens: maxTokens || MAX_TOKENS
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

	// Select prompts based on chunk index
	const call2aPrompt = input.chunkIndex === 0
		? CHUNK_0_COMPRESSION_PROMPT      // Metadata-focused
		: MODIFIED_CALL_2A_PROMPT;        // Detail-focused

	const call2bPrompt = input.chunkIndex === 0
		? CHUNK_0_CALL_2B_PROMPT
		: MODIFIED_CALL_2B_PROMPT;

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

		const call2aRaw = await callFireworksAPI(call2aPrompt, userContent, maxTokens);
		call2aResponse = parseJsonResponse(call2aRaw);
	} catch (error) {
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
		const call2bRaw = await callFireworksAPI(call2bPrompt, userContent, maxTokens);
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
	CHUNK_0_COMPRESSION_PROMPT,
	CHUNK_0_CALL_2B_PROMPT,
	MODIFIED_CALL_2A_PROMPT,
	MODIFIED_CALL_2B_PROMPT
};

// Already exported above:
// - FileCompressionError (class)
// - ChunkCompressionInput (interface)
// - ChunkCompressionResult (interface)
// - Call2Response (interface)
// - compressChunk (function)
