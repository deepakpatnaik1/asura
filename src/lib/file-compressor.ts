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
 * Input to compression function
 */
export interface CompressionInput {
	/** Extracted text content from file */
	extractedText: string;
	/** Original filename including extension */
	filename: string;
	/** Classified file type */
	fileType: FileType;
}

/**
 * Output from compression function (final result)
 */
export interface CompressionResult {
	/** Exact filename from input */
	filename: string;
	/** File type from input */
	fileType: FileType;
	/** Artisan Cut compressed description */
	description: string;
	/** Raw Call 2A response for debugging */
	call2aResponse: any;
	/** Raw Call 2B response for debugging */
	call2bResponse: any;
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
const MAX_TOKENS = 2000;

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
 * Modified Call 2B Prompt - Verification of Call 2A output
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
 * Validate compression input
 */
function validateInput(input: CompressionInput): void {
	if (!input.extractedText || input.extractedText.trim().length === 0) {
		throw new FileCompressionError(
			'Extracted text cannot be empty',
			'EMPTY_CONTENT'
		);
	}

	if (input.extractedText.length > MAX_CONTENT_LENGTH) {
		throw new FileCompressionError(
			`Content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`,
			'VALIDATION_ERROR',
			{ actualLength: input.extractedText.length }
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
	userContent: string
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
			max_tokens: MAX_TOKENS
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
 * Compress file content using Artisan Cut technique via Fireworks AI
 *
 * Flow:
 * 1. Validate input (non-empty text, valid file type)
 * 2. Call Fireworks with Modified Call 2A prompt
 * 3. Parse Call 2A response as JSON, validate structure
 * 4. Call Fireworks with Modified Call 2B prompt using Call 2A output
 * 5. Parse Call 2B response as JSON, validate structure
 * 6. Return final CompressionResult
 *
 * @param input - Compression input with extracted text, filename, and file type
 * @returns Compression result with filename, file type, and compressed description
 * @throws FileCompressionError - For validation, API, or parsing errors
 */
export async function compressFile(input: CompressionInput): Promise<CompressionResult> {
	// Validate environment first
	try {
		validateEnvironment();
	} catch (error) {
		throw error;
	}

	// Validate input
	try {
		validateInput(input);
	} catch (error) {
		throw error;
	}

	let call2aResponse: any;
	let call2bResponse: any;

	// Step 1: Call Fireworks with Modified Call 2A prompt
	try {
		const userContent = `File: ${input.filename}\nFile Type: ${input.fileType}\n\n${input.extractedText}`;

		const call2aRawResponse = await callFireworksAPI(
			MODIFIED_CALL_2A_PROMPT,
			userContent
		);

		call2aResponse = parseJsonResponse(call2aRawResponse);
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

	// Step 2: Call Fireworks with Modified Call 2B prompt
	try {
		const userContent = JSON.stringify(call2aResponse);

		const call2bRawResponse = await callFireworksAPI(
			MODIFIED_CALL_2B_PROMPT,
			userContent
		);

		call2bResponse = parseJsonResponse(call2bRawResponse);
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

	// Return final result
	return {
		filename: call2bResponse.filename,
		fileType: call2bResponse.file_type,
		description: call2bResponse.description,
		call2aResponse: call2aResponse,
		call2bResponse: call2bResponse
	};
}

// ============================================================================
// EXPORTS
// ============================================================================

// Already exported above:
// - FileCompressionError (class)
// - CompressionInput (interface)
// - CompressionResult (interface)
// - Call2Response (interface)
// - compressFile (function)
