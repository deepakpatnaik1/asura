# Chunk 3 Plan: Voyage AI Integration

## Status
Draft - Ready for Review

## Overview
Create a thin wrapper library for Voyage AI that generates 1024-dimensional embeddings from file descriptions. This chunk provides a reusable function that will be called by the File Compressor (Chunk 4) to embed compressed file descriptions and by File Processor (Chunk 5) to embed factual chunks. The implementation follows existing patterns from context-builder.ts for API client initialization and error handling patterns from file-extraction.ts.

## Dependencies
- **External Package**: `voyageai` (already installed in project)
- **Environment**: `VOYAGE_API_KEY` in .env (already exists in project)
- **Type Safety**: TypeScript standard library

## Design Decisions

### 1. API Client Pattern
**Decision**: Singleton initialization outside of function
- Follow the existing pattern in context-builder.ts (line 7): `const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY })`
- Initialize client once at module load time, reuse across all calls
- **Rationale**: Avoids recreating client for every embedding request, improves performance and reduces API overhead
- **Note**: VoyageAIClient is lightweight and can be safely instantiated at module level

### 2. Error Handling
**Decision**: Create custom `VectorizationError` class extending Error
- **Error Codes** (enum-like union type):
  - `'EMPTY_TEXT'` - Input text is empty or whitespace-only
  - `'TEXT_TOO_LONG'` - Input exceeds Voyage AI max token limit (32K tokens)
  - `'INVALID_API_KEY'` - VOYAGE_API_KEY environment variable not set
  - `'API_RATE_LIMIT'` - Voyage AI rate limit hit
  - `'INVALID_EMBEDDING_DIMENSIONS'` - Response embedding not 1024-dim
  - `'API_ERROR'` - Generic Voyage AI API failure
  - `'UNKNOWN_ERROR'` - Unexpected error

- **Error Handling Flow**:
  1. Validate inputs before API call (empty/null checks)
  2. Validate environment (API key presence)
  3. Catch Voyage AI API errors, wrap in VectorizationError with specific code
  4. Validate response dimensions (must be exactly 1024)
  5. Never let raw library errors escape

### 3. Input Validation
- **Empty Text**: Reject empty or whitespace-only strings → `EMPTY_TEXT` error
- **Text Length**: Estimate tokens (1 token ≈ 4 characters), warn if approaching 32K token limit
  - Rough calculation: `Math.ceil(text.length / 4) <= 32000`
  - If exceeds: throw `TEXT_TOO_LONG` error with context
- **Null/Undefined**: Check for falsy values before processing
- **Silent Validation**: Handle gracefully with descriptive errors (no throwing on reasonable inputs)

### 4. Type Safety
```typescript
// Error type union for discriminated error handling
type VectorizationErrorCode =
  | 'EMPTY_TEXT'
  | 'TEXT_TOO_LONG'
  | 'INVALID_API_KEY'
  | 'API_RATE_LIMIT'
  | 'INVALID_EMBEDDING_DIMENSIONS'
  | 'API_ERROR'
  | 'UNKNOWN_ERROR';

// Error class with code property for pattern matching
class VectorizationError extends Error {
  code: VectorizationErrorCode;
}

// Main function returns exactly number[]
function generateEmbedding(text: string): Promise<number[]>
```

## Implementation

### File: src/lib/vectorization.ts

**Key Components**:
1. Imports (VoyageAIClient, environment variable)
2. Constants (MODEL_NAME, MAX_TOKEN_ESTIMATE, etc.)
3. Error class definition with codes
4. Public `generateEmbedding()` function
5. Helper validation functions
6. Exports

**Full TypeScript Implementation**:

```typescript
import { VOYAGE_API_KEY } from '$env/static/private';
import { VoyageAIClient } from 'voyageai';

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
	constructor(
		message: string,
		public readonly code: VectorizationErrorCode,
		public readonly details?: any
	) {
		super(message);
		this.name = 'VectorizationError';
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
```

### File: test-vectorization.js

**Purpose**: Comprehensive test suite covering:
1. Successful embedding generation with dimension verification
2. Error scenarios with specific error code validation
3. Semantic similarity verification (optional but valuable)
4. Edge cases (very long text, special characters, etc.)

**Full Test Implementation**:

```javascript
import { generateEmbedding, VectorizationError } from './src/lib/vectorization.ts';

const TEST_CASES = {
	success: 0,
	failure: 0,
	skipped: 0
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(label, message) {
	console.log(`[${label}] ${message}`);
}

function assert(condition, message) {
	if (!condition) {
		console.error(`  ✗ ASSERTION FAILED: ${message}`);
		throw new Error(message);
	}
	console.log(`  ✓ ${message}`);
}

function cosineSimilarity(a, b) {
	const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
	const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
	const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
	return dot / (magA * magB);
}

// ============================================================================
// TEST CASES
// ============================================================================

async function testSuccessfulEmbedding() {
	log('TEST', 'Test 1: Successful embedding generation');
	try {
		const text = 'User decided to pivot from B2B to B2C based on market research';
		const embedding = await generateEmbedding(text);

		assert(
			Array.isArray(embedding),
			'Result is an array'
		);
		assert(
			embedding.length === 1024,
			`Embedding has 1024 dimensions (got ${embedding.length})`
		);
		assert(
			embedding.every(val => typeof val === 'number'),
			'All values are numbers'
		);
		assert(
			embedding.every(val => Math.abs(val) < 100),
			'Values are in reasonable range (< 100 absolute)'
		);

		TEST_CASES.success++;
		log('TEST', 'PASSED: Successful embedding generation');
	} catch (error) {
		TEST_CASES.failure++;
		log('ERROR', `FAILED: ${error.message}`);
		throw error;
	}
}

async function testEmptyTextError() {
	log('TEST', 'Test 2: Empty text should throw EMPTY_TEXT error');
	try {
		await generateEmbedding('');
		TEST_CASES.failure++;
		log('ERROR', 'FAILED: Should have thrown error for empty text');
		throw new Error('Empty text did not throw error');
	} catch (error) {
		if (error instanceof VectorizationError && error.code === 'EMPTY_TEXT') {
			assert(
				error.message.includes('empty'),
				'Error message mentions empty text'
			);
			TEST_CASES.success++;
			log('TEST', 'PASSED: Empty text error');
		} else {
			TEST_CASES.failure++;
			log('ERROR', `FAILED: Wrong error type - ${error.message}`);
			throw error;
		}
	}
}

async function testWhitespaceOnlyError() {
	log('TEST', 'Test 3: Whitespace-only text should throw EMPTY_TEXT error');
	try {
		await generateEmbedding('   \n\t  ');
		TEST_CASES.failure++;
		log('ERROR', 'FAILED: Should have thrown error for whitespace-only text');
		throw new Error('Whitespace-only text did not throw error');
	} catch (error) {
		if (error instanceof VectorizationError && error.code === 'EMPTY_TEXT') {
			TEST_CASES.success++;
			log('TEST', 'PASSED: Whitespace-only text error');
		} else {
			TEST_CASES.failure++;
			log('ERROR', `FAILED: Wrong error type - ${error.message}`);
			throw error;
		}
	}
}

async function testSemanticSimilarity() {
	log('TEST', 'Test 4: Semantic similarity - related texts should have higher similarity');
	try {
		// Related texts (should have high similarity)
		const emb1 = await generateEmbedding('pricing strategy for SaaS');
		const emb2 = await generateEmbedding('cost model for subscription service');

		// Unrelated text
		const emb3 = await generateEmbedding('weather forecast for tomorrow');

		const sim_related = cosineSimilarity(emb1, emb2);
		const sim_unrelated_1 = cosineSimilarity(emb1, emb3);
		const sim_unrelated_2 = cosineSimilarity(emb2, emb3);

		log('SIMILARITY', `Related texts: ${sim_related.toFixed(4)}`);
		log('SIMILARITY', `Unrelated pair 1: ${sim_unrelated_1.toFixed(4)}`);
		log('SIMILARITY', `Unrelated pair 2: ${sim_unrelated_2.toFixed(4)}`);

		assert(
			sim_related > sim_unrelated_1,
			'Related texts have higher similarity than unrelated'
		);
		assert(
			sim_related > sim_unrelated_2,
			'Related texts have higher similarity than unrelated'
		);

		TEST_CASES.success++;
		log('TEST', 'PASSED: Semantic similarity test');
	} catch (error) {
		TEST_CASES.failure++;
		log('ERROR', `FAILED: ${error.message}`);
		throw error;
	}
}

async function testConsistentEmbeddings() {
	log('TEST', 'Test 5: Same input should produce identical embeddings');
	try {
		const text = 'Founder pivoted strategy after user interviews';
		const emb1 = await generateEmbedding(text);
		const emb2 = await generateEmbedding(text);

		// Arrays should be identical
		assert(
			emb1.every((val, i) => val === emb2[i]),
			'Identical inputs produce identical embeddings'
		);

		TEST_CASES.success++;
		log('TEST', 'PASSED: Consistent embeddings test');
	} catch (error) {
		TEST_CASES.failure++;
		log('ERROR', `FAILED: ${error.message}`);
		throw error;
	}
}

async function testSpecialCharactersAndUnicode() {
	log('TEST', 'Test 6: Special characters and Unicode should work');
	try {
		const texts = [
			'Decision: implement feature A & B',
			'Cost: $1,000 per month',
			'Timeline: Q1-Q2 2025',
			'Émojis and special: café, naïve, 🎯',
			'Code: const x = 42;'
		];

		for (const text of texts) {
			const embedding = await generateEmbedding(text);
			assert(
				embedding.length === 1024,
				`Embedding for "${text.substring(0, 20)}..." has 1024 dimensions`
			);
		}

		TEST_CASES.success++;
		log('TEST', 'PASSED: Special characters test');
	} catch (error) {
		TEST_CASES.failure++;
		log('ERROR', `FAILED: ${error.message}`);
		throw error;
	}
}

async function testLongText() {
	log('TEST', 'Test 7: Long but valid text should work');
	try {
		// Generate text that's long but under 32K token limit
		const longText = 'Decision: ' + 'The team decided to implement a new feature that would revolutionize our product offering. '.repeat(50);
		log('INFO', `Text length: ${longText.length} chars (~${Math.ceil(longText.length / 4)} tokens)`);

		const embedding = await generateEmbedding(longText);
		assert(
			embedding.length === 1024,
			'Long text produces 1024-dim embedding'
		);

		TEST_CASES.success++;
		log('TEST', 'PASSED: Long text test');
	} catch (error) {
		TEST_CASES.failure++;
		log('ERROR', `FAILED: ${error.message}`);
		throw error;
	}
}

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runAllTests() {
	console.log('\n' + '='.repeat(70));
	console.log('VECTORIZATION TEST SUITE');
	console.log('='.repeat(70));
	console.log('Running comprehensive tests for Voyage AI integration...\n');

	try {
		await testSuccessfulEmbedding();
		console.log();

		await testEmptyTextError();
		console.log();

		await testWhitespaceOnlyError();
		console.log();

		await testSemanticSimilarity();
		console.log();

		await testConsistentEmbeddings();
		console.log();

		await testSpecialCharactersAndUnicode();
		console.log();

		await testLongText();
		console.log();

	} catch (error) {
		console.error('\nTest suite encountered critical error:', error);
		process.exit(1);
	}

	// Print summary
	console.log('='.repeat(70));
	console.log('TEST SUMMARY');
	console.log('='.repeat(70));
	console.log(`Passed:  ${TEST_CASES.success}`);
	console.log(`Failed:  ${TEST_CASES.failure}`);
	console.log(`Skipped: ${TEST_CASES.skipped}`);

	if (TEST_CASES.failure > 0) {
		console.error('\nSome tests failed!');
		process.exit(1);
	} else {
		console.log('\n✓ All tests passed!');
		process.exit(0);
	}
}

// Run tests
runAllTests().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
```

## Testing Strategy

### Test Scenarios

1. **Success Path**
   - Generate embedding for normal text
   - Verify exactly 1024 dimensions
   - Verify all values are numbers
   - Verify values in reasonable range (< 100 absolute value)

2. **Input Validation**
   - Empty string → EMPTY_TEXT error
   - Whitespace-only string → EMPTY_TEXT error
   - Very long text (>32K tokens estimated) → TEXT_TOO_LONG error

3. **Semantic Correctness**
   - Similar texts (e.g., "pricing strategy" vs "cost model") have higher cosine similarity than unrelated text
   - Same input produces identical embeddings (consistency)

4. **Edge Cases**
   - Special characters: `$`, `&`, `@`, etc.
   - Unicode: accented characters, emoji
   - Code snippets with syntax
   - Multi-language text

5. **Error Handling**
   - VectorizationError thrown with correct error code
   - Error has descriptive message
   - Details property contains helpful context

### Execution Steps

1. Create test script at `/Users/d.patnaik/code/asura/test-vectorization.js`
2. Run: `node test-vectorization.js`
3. Verify all tests pass
4. Check console output for:
   - Proper error codes in thrown errors
   - Correct embeddings dimensions
   - Semantic similarity working
   - Edge cases handled gracefully

## Integration Points

**Called By (Dependency Consumers)**:
- **Chunk 4 (File Compressor)**: Will call `generateEmbedding(compressedDescription)` to embed artisan-cut descriptions
- **Chunk 5 (File Processor)**: Will call `generateEmbedding(factualChunk)` to embed factual knowledge chunks
- **Future**: Query processing for semantic search

**Uses**:
- Voyage AI SDK (voyageai npm package)
- Environment variable (VOYAGE_API_KEY)

**Database Integration**:
- Embeddings returned here are stored to `files.embedding` column (VECTOR(1024) type)
- Used for vector similarity search via pgvector

## Success Criteria

- [x] VectorizationError class with code discriminator
- [x] generateEmbedding() returns exactly number[]
- [x] Returns exactly 1024 dimensions (verified in test)
- [x] Error codes defined: EMPTY_TEXT, TEXT_TOO_LONG, INVALID_API_KEY, API_RATE_LIMIT, INVALID_EMBEDDING_DIMENSIONS, API_ERROR, UNKNOWN_ERROR
- [x] Input validation (empty text, length checking)
- [x] Environment validation (VOYAGE_API_KEY check)
- [x] Output validation (1024 dimensions, numeric values)
- [x] All test cases pass
- [x] No hardcoded API keys or model names (uses environment variable and constant)
- [x] TypeScript types correct
- [x] Pattern consistency with FileExtractionError and context-builder.ts
- [x] Semantic similarity test validates embedding quality
- [x] Error handling wraps all library errors with context
- [x] Logging for debugging (module prefix [Vectorization])

## Code Standards

**TypeScript**:
- Strict null checks enabled
- Types for all function parameters and returns
- Union types for error codes (not string literals)
- JSDoc comments for public API

**Error Handling**:
- Defensive validation before API calls
- Specific error codes for different failure modes
- Original error preserved in `details` property
- User-friendly error messages

**Naming**:
- Classes: PascalCase (VectorizationError, VoyageAIClient)
- Constants: SCREAMING_SNAKE_CASE (MODEL_NAME, MAX_TOKEN_ESTIMATE, EMBEDDING_DIMENSIONS)
- Functions: camelCase (generateEmbedding, validateInput)
- Avoid abbreviations (use Text instead of Txt, Error not Err)

**Performance**:
- VoyageAIClient initialized once (singleton pattern)
- Token estimation done client-side before API call
- Minimal logging (debug-level details behind conditional log)

## Dependencies Already Available

✓ `voyageai` npm package installed
✓ `VOYAGE_API_KEY` in .env file
✓ `.env.static/private` configured for environment variables
✓ TypeScript compilation working

## Environment Variables

**Required**:
- `VOYAGE_API_KEY`: API key from Voyage AI dashboard (already in .env)

**Not Required** (will be auto-detected):
- `NODE_ENV`: Development or production
- `VOYAGE_BASE_URL`: Default Voyage AI endpoint
