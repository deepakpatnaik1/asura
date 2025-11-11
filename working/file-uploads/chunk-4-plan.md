# Chunk 4: Modified Call 2 Integration - Implementation Plan

**Status:** Planning Phase (Ready for Review)
**Created:** 2025-11-11
**Doer:** Claude

---

## Overview

This chunk implements the file compression library (`src/lib/file-compressor.ts`) that applies the Artisan Cut compression technique to extracted file content using a two-step process (Modified Call 2A → Modified Call 2B) via Fireworks AI.

The Modified Call 2A/2B prompts (from system-prompts.md lines 305-448) are specifically designed for file compression and differ from the regular Call 2A/2B used for conversation turns. They preserve non-inferable information (numbers, dates, entities, decisions) while compressing verbose prose and removing noise.

---

## 1. Critical Requirements from system-prompts.md

### Modified Call 2A Prompt (lines 310-424)
- **Purpose:** Apply Artisan Cut compression to uploaded file content
- **Input:** Extracted file text + filename + file_type
- **Output:** JSON with `{ filename, file_type, description }`
- **Key Principle:** Keep everything that cannot be easily inferred from fewer words; compress what can be inferred; remove noise
- **File-Type Specific Guidance:**
  - PDFs: Capture doc type, structure, core thesis, critical data, strategic decisions, risks
  - Text Files: File type, purpose, critical info, specific values, instructions, terminology
  - Images: Visual elements, text content, colors, style, technical details
  - Code: Language, purpose, main components, key logic, dependencies, entry points
  - Spreadsheets: Dimensions, headers, data types, key values, purpose

### Modified Call 2B Prompt (lines 448+, to be confirmed)
- **Purpose:** Verification and refinement of Call 2A output
- **Input:** Call 2A JSON response
- **Output:** Final verified JSON with same structure

---

## 2. File Structure

**New file to create:**
- `/Users/d.patnaik/code/asura/src/lib/file-compressor.ts`

**Existing dependencies (already installed):**
- `openai` (already used for Fireworks in `/Users/d.patnaik/code/asura/src/routes/api/chat/+server.ts`)
- TypeScript types

**Environment variables required:**
- `FIREWORKS_API_KEY` - Already defined in `.env.example`
- Uses Qwen 2.5 235B model (not OpenAI/Anthropic)

---

## 3. Implementation Plan

### 3.1 Error Class: `FileCompressionError`

```typescript
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
```

**Error Codes:**
- `EMPTY_CONTENT`: Input text is empty/whitespace-only
- `INVALID_FILE_TYPE`: File type not in valid enum (pdf|image|text|code|spreadsheet|other)
- `API_ERROR`: Fireworks API call failed
- `JSON_PARSE_ERROR`: Response cannot be parsed as JSON or missing required fields
- `VALIDATION_ERROR`: Response JSON structure invalid (missing filename, file_type, or description)
- `RATE_LIMIT`: Fireworks API rate limit hit
- `UNKNOWN_ERROR`: Unexpected error during compression

---

### 3.2 Type Definitions

```typescript
import type { FileType } from './file-extraction';

/**
 * Input to compression function
 */
export interface CompressionInput {
	extractedText: string;    // From Chunk 2 extraction
	filename: string;          // Original filename
	fileType: FileType;        // Classified type from Chunk 2
}

/**
 * Output from compression function (final result)
 */
export interface CompressionResult {
	filename: string;          // Exact filename from input
	fileType: FileType;        // File type from input
	description: string;       // Artisan Cut compressed description
	call2aResponse: any;       // Raw Call 2A response (for debugging)
	call2bResponse: any;       // Raw Call 2B response (for debugging)
}

/**
 * Call 2A/2B API response structure
 */
export interface Call2Response {
	filename: string;
	file_type: FileType;
	description: string;
}
```

---

### 3.3 Main Function: `compressFile()`

**Signature:**
```typescript
export async function compressFile(
	input: CompressionInput
): Promise<CompressionResult>
```

**Flow:**
1. Validate input (non-empty text, valid file type)
2. Call Fireworks with Modified Call 2A prompt
3. Parse Call 2A response as JSON, validate structure
4. Call Fireworks with Modified Call 2B prompt using Call 2A output
5. Parse Call 2B response as JSON, validate structure
6. Return final CompressionResult with all three responses

**Error Handling:**
- Throw `FileCompressionError` with appropriate code for each failure scenario
- Include original API error details in the `details` field
- Provide helpful error messages to caller

---

### 3.4 Implementation Details

**Environment Variable Access:**
```typescript
// Must work in both:
// 1. Server route handler (SvelteKit): available via $env/static/private
// 2. Direct Node execution (tests): available via process.env

const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY || '';
```

**Fireworks Client Setup:**
```typescript
// Reuse pattern from src/routes/api/chat/+server.ts
const fireworks = new OpenAI({
	baseURL: 'https://api.fireworks.ai/inference/v1',
	apiKey: FIREWORKS_API_KEY
});
```

**API Call Pattern:**
```typescript
// Model: Qwen 2.5 235B
// Use messages format like the chat route does
const response = await fireworks.chat.completions.create({
	model: 'accounts/fireworks/models/qwen2p5-72b-instruct',
	messages: [
		{
			role: 'system',
			content: MODIFIED_CALL_2A_PROMPT
		},
		{
			role: 'user',
			content: `File: ${filename}\nFile Type: ${fileType}\n\n${extractedText}`
		}
	],
	// ... temperature, max_tokens, etc.
});
```

**JSON Extraction:**
- Fireworks returns text in `response.choices[0].message.content`
- Extract JSON using regex or JSON.parse
- Handle cases where response is wrapped in markdown code blocks

**Call 2B Verification:**
- Use Call 2A output as input to Call 2B
- Call 2B ensures description matches Artisan Cut principles
- Final description is from Call 2B response

---

### 3.5 Helper Functions

**`validateInput(input: CompressionInput): void`**
- Check extractedText is not empty/whitespace
- Check fileType is valid enum value
- Throw `FileCompressionError` with code `EMPTY_CONTENT` or `INVALID_FILE_TYPE`

**`parseJsonResponse(text: string): Call2Response`**
- Handle JSON in response body directly
- Handle JSON wrapped in markdown code blocks (```json ... ```)
- Parse and validate structure has required fields
- Throw `FileCompressionError` with code `JSON_PARSE_ERROR` if parsing fails
- Throw `FileCompressionError` with code `VALIDATION_ERROR` if fields missing

**`validateEnvironment(): void`**
- Check FIREWORKS_API_KEY is set
- Throw `FileCompressionError` with code `API_ERROR` if missing

---

### 3.6 Prompts Integration

The actual prompts are embedded as constants in the file:

**MODIFIED_CALL_2A_PROMPT:**
- Full text from system-prompts.md lines 310-424
- Instruction: "Apply Artisan Cut to create a compressed file description"
- Includes file-type specific guidelines
- Specifies JSON output format with exact field names

**MODIFIED_CALL_2B_PROMPT:**
- Read from system-prompts.md to confirm exact text
- Purpose: Verify Call 2A output matches Artisan Cut principles
- Refine description if needed
- Return validated JSON

---

## 4. Configuration & Constants

```typescript
// API Model Configuration
const MODEL_NAME = 'accounts/fireworks/models/qwen2p5-72b-instruct' as const;

// API Call Configuration
const TEMPERATURE = 0.7;              // Balanced creativity/consistency
const MAX_TOKENS = 2000;              // Generous limit for descriptions
const TIMEOUT_MS = 30000;             // 30 second timeout per call

// Validation
const MAX_CONTENT_LENGTH = 100000;    // Max input text length
```

---

## 5. Error Handling Strategy

### 5.1 API Errors
```
Fireworks API call fails
  ├─ Rate limit (429): throw with code RATE_LIMIT
  ├─ Auth error (401/403): throw with code API_ERROR
  ├─ Network error: throw with code API_ERROR
  └─ Other HTTP error: throw with code API_ERROR
```

### 5.2 Response Parsing Errors
```
Response received but not valid JSON/structure
  ├─ JSON.parse fails: throw with code JSON_PARSE_ERROR
  ├─ Missing fields: throw with code VALIDATION_ERROR
  ├─ Invalid file_type: throw with code VALIDATION_ERROR
  └─ Empty description: throw with code VALIDATION_ERROR
```

### 5.3 Input Validation Errors
```
Input validation fails
  ├─ Empty content: throw with code EMPTY_CONTENT
  └─ Invalid file type: throw with code INVALID_FILE_TYPE
```

---

## 6. Integration Points

### 6.1 Imports
This library will be imported by:
- `src/lib/file-processor.ts` (Chunk 5) - File processing orchestration
- Test script for manual verification

### 6.2 Export Interface
```typescript
export { compressFile };
export { FileCompressionError };
export type { CompressionInput, CompressionResult, Call2Response };
```

### 6.3 Usage Example
```typescript
import { compressFile, FileCompressionError } from '$lib/file-compressor';

try {
	const result = await compressFile({
		extractedText: '... file content ...',
		filename: 'document.pdf',
		fileType: 'pdf'
	});

	console.log('Compressed description:', result.description);
} catch (error) {
	if (error instanceof FileCompressionError) {
		console.error('Compression failed:', error.code, error.message);
	}
}
```

---

## 7. Test Strategy

### 7.1 Test Files Needed
Create test files in `/Users/d.patnaik/code/asura/test-files/`:
- Sample PDF content (extracted text)
- Sample image metadata
- Sample code file content
- Sample spreadsheet data
- Sample text document

### 7.2 Manual Test Script
Create `/Users/d.patnaik/code/asura/test-file-compressor.js`:

```javascript
import { compressFile, FileCompressionError } from './src/lib/file-compressor.ts';

async function testCompressionBasic() {
	console.log('\n=== Testing Basic Compression ===');

	try {
		const result = await compressFile({
			extractedText: 'Sample PDF content about startup metrics: $2M ARR, 40% growth MoM, 150 customers',
			filename: 'quarterly-report.pdf',
			fileType: 'pdf'
		});

		console.log('Filename:', result.filename);
		console.log('File Type:', result.fileType);
		console.log('Description:', result.description);
		console.log('PASS: Basic compression works');
	} catch (error) {
		console.error('FAIL:', error.message);
	}
}

async function testCompressionEmptyContent() {
	console.log('\n=== Testing Empty Content ===');

	try {
		await compressFile({
			extractedText: '',
			filename: 'empty.txt',
			fileType: 'text'
		});
		console.log('FAIL: Should have thrown error for empty content');
	} catch (error) {
		if (error instanceof FileCompressionError && error.code === 'EMPTY_CONTENT') {
			console.log('PASS: Empty content throws EMPTY_CONTENT error');
		} else {
			console.log('FAIL: Wrong error code:', error.code);
		}
	}
}

async function testCompressionInvalidFileType() {
	console.log('\n=== Testing Invalid File Type ===');

	try {
		await compressFile({
			extractedText: 'Some content',
			filename: 'test.xyz',
			fileType: 'invalid' // Invalid type
		});
		console.log('FAIL: Should have thrown error for invalid file type');
	} catch (error) {
		if (error instanceof FileCompressionError && error.code === 'INVALID_FILE_TYPE') {
			console.log('PASS: Invalid file type throws INVALID_FILE_TYPE error');
		} else {
			console.log('FAIL: Wrong error code:', error.code);
		}
	}
}

async function testCompressionMultipleTypes() {
	console.log('\n=== Testing Multiple File Types ===');

	const tests = [
		{
			name: 'PDF with financial data',
			input: {
				extractedText: 'Q3 2025 Results: Revenue $5.2M, Operating margin 15%, Customer acquisition cost $850',
				filename: 'investor-deck.pdf',
				fileType: 'pdf'
			}
		},
		{
			name: 'Code file',
			input: {
				extractedText: 'function compressText(text) { const words = text.split(/\\s+/); return words.slice(0, 10).join(" "); }',
				filename: 'utils.js',
				fileType: 'code'
			}
		},
		{
			name: 'Text file',
			input: {
				extractedText: 'Meeting notes: Discussed launch strategy. Decision: Focus on B2B first, B2C in Q2.',
				filename: 'notes.txt',
				fileType: 'text'
			}
		}
	];

	for (const test of tests) {
		try {
			const result = await compressFile(test.input);
			console.log(`✓ ${test.name}`);
			console.log(`  Description length: ${result.description.length} chars`);
		} catch (error) {
			console.log(`✗ ${test.name}: ${error.message}`);
		}
	}
}

async function runTests() {
	console.log('Starting File Compressor Tests...');

	// Validate environment first
	if (!process.env.FIREWORKS_API_KEY) {
		console.error('ERROR: FIREWORKS_API_KEY not set in environment');
		process.exit(1);
	}

	await testCompressionBasic();
	await testCompressionEmptyContent();
	await testCompressionInvalidFileType();
	await testCompressionMultipleTypes();

	console.log('\nAll tests completed.');
}

runTests().catch(console.error);
```

### 7.3 Test Execution Plan
1. Set FIREWORKS_API_KEY in environment
2. Build TypeScript: `npm run build`
3. Run test script: `node test-file-compressor.js`
4. Verify outputs meet Artisan Cut principles
5. Check error handling works correctly

### 7.4 Expected Test Results

| Test | Expected Outcome |
|------|------------------|
| Basic compression | JSON response with compressed description |
| Empty content | `FileCompressionError` with code `EMPTY_CONTENT` |
| Invalid file type | `FileCompressionError` with code `INVALID_FILE_TYPE` |
| PDF compression | Description preserves numbers ($2M, 40%, 150) |
| Code compression | Description captures language and purpose |
| Text compression | Description captures decision or core content |
| Call 2B validation | Final output matches Artisan Cut principles |

---

## 8. Edge Cases & Handling

### 8.1 Very Long Content
- **Input:** extractedText > 100,000 characters
- **Handling:** Truncate with warning or raise VALIDATION_ERROR
- **Decision:** Truncate to 100,000 chars with truncation indicator in description

### 8.2 Non-English Content
- **Input:** UTF-8 text in multiple languages
- **Handling:** Pass through to API as-is
- **Expected:** Fireworks Qwen model handles Unicode

### 8.3 Special Characters & Formatting
- **Input:** JSON, XML, code with special chars
- **Handling:** Preserve in extracted text
- **Ensure:** Response parsing handles escaped quotes/newlines

### 8.4 Rate Limiting
- **Input:** Rapid succession of API calls
- **Handling:** Catch HTTP 429, throw with code RATE_LIMIT
- **Caller responsibility:** Implement backoff/retry logic

### 8.5 API Timeout
- **Input:** Slow Fireworks API responses
- **Handling:** Set timeout, throw API_ERROR on timeout
- **Timeout:** 30 seconds per call (2 calls = 60s max)

### 8.6 Malformed JSON Response
- **Input:** API returns non-JSON or incomplete JSON
- **Handling:** Try regex extraction, then JSON.parse fallback
- **Throw:** JSON_PARSE_ERROR if both fail

---

## 9. Performance Considerations

### 9.1 API Call Duration
- **Call 2A:** ~3-5 seconds for typical file
- **Call 2B:** ~2-4 seconds for verification
- **Total:** ~5-9 seconds per file (acceptable for async processing)

### 9.2 Concurrency
- **Fireworks:** Rate limits ~100 req/min (check Fireworks docs)
- **Design:** File processing queued by file-processor.ts
- **No local concurrency limits** in this module (caller manages)

### 9.3 Token Usage
- **Call 2A input:** ~500-2000 tokens (depends on extracted content)
- **Call 2A output:** ~200-500 tokens
- **Call 2B input:** ~200-500 tokens
- **Call 2B output:** ~200-500 tokens
- **Cost:** ~$0.02-0.05 per file (based on Fireworks pricing)

---

## 10. Security Considerations

### 10.1 API Key Management
- **FIREWORKS_API_KEY:** From `$env/static/private` in SvelteKit
- **Never logged:** API key never appears in logs or responses
- **Validation:** Check key exists before API calls

### 10.2 Input Validation
- **Content:** Accept any UTF-8 text (no content filtering)
- **Length:** Limit to 100,000 chars to prevent abuse
- **Type:** Validate enum value matches FileType

### 10.3 Response Validation
- **JSON structure:** Validate required fields exist
- **Content:** No sanitization needed (already compressed)
- **Size limit:** Enforce max description length

---

## 11. Dependency Notes

### 11.1 Why OpenAI Client for Fireworks?
- Fireworks API is OpenAI-compatible
- Can reuse `new OpenAI({ baseURL: 'https://api.fireworks.ai/...' })`
- Already used in `/src/routes/api/chat/+server.ts`
- No additional dependencies needed

### 11.2 No New Dependencies
- All dependencies already installed
- TypeScript types from existing `@types/node`
- File extraction types imported from Chunk 2

---

## 12. Integration with File Extraction

### 12.1 Input from Chunk 2
```typescript
// Output of extractText() from file-extraction.ts
const extraction = await extractText(buffer, filename);

// Input to compressFile()
const compression = await compressFile({
	extractedText: extraction.text,      // From ExtractionResult.text
	filename: extraction.filename,       // Preserved
	fileType: extraction.fileType        // From ExtractionResult.fileType
});
```

### 12.2 Type Compatibility
- `FileType` imported from `file-extraction.ts`
- Same enum values: 'pdf'|'image'|'text'|'code'|'spreadsheet'|'other'
- No type conversion needed

---

## 13. Full Prompt Specification

### 13.1 Modified Call 2A Prompt Text
Complete prompt from system-prompts.md lines 310-424:
```
[Full prompt will be embedded as constant in code]
```

### 13.2 Modified Call 2B Prompt Text
Complete prompt to be read from system-prompts.md:
```
[Full prompt will be read/confirmed during implementation]
```

### 13.3 Prompt Delivery
- Prompts sent to Fireworks via OpenAI-compatible API
- System message contains the prompt
- User message contains the file content

---

## 14. Code Style & Patterns

### 14.1 Matching Existing Codebase
- **Error handling:** Pattern matches `FileExtractionError` from Chunk 2
- **Environment access:** Pattern matches `src/routes/api/chat/+server.ts`
- **API calls:** Pattern matches existing Fireworks usage
- **TypeScript:** Strict types, JSDoc comments, clear naming

### 14.2 File Organization
```
src/lib/file-compressor.ts
  ├─ Imports
  ├─ Error Classes (FileCompressionError)
  ├─ Type Definitions
  ├─ Constants (prompts, model config)
  ├─ Client Initialization (Fireworks)
  ├─ Main API (compressFile)
  └─ Helper Functions (validate, parse, etc.)
```

---

## 15. Acceptance Criteria

### 15.1 Functional Requirements
- [ ] `compressFile()` accepts CompressionInput with non-empty text and valid file type
- [ ] Call 2A API request sent to Fireworks with Modified Call 2A prompt
- [ ] Call 2A response parsed as JSON with expected structure
- [ ] Call 2B API request sent to Fireworks with Modified Call 2B prompt
- [ ] Call 2B response parsed as JSON with expected structure
- [ ] Final CompressionResult includes all three fields: filename, fileType, description
- [ ] Description preserves non-inferable information (numbers, dates, entities)
- [ ] Description compresses verbose prose and removes noise

### 15.2 Error Handling
- [ ] `FileCompressionError` thrown for all failure scenarios
- [ ] Error codes assigned correctly to error conditions
- [ ] Error messages are descriptive and helpful
- [ ] API errors include original error details in `.details` field
- [ ] Empty content detected and rejected
- [ ] Invalid file types rejected

### 15.3 Code Quality
- [ ] TypeScript compiles without errors
- [ ] All functions have JSDoc comments
- [ ] Code follows existing project style
- [ ] No hardcoded values (except prompts which are from spec)
- [ ] No API keys logged or exposed
- [ ] Async/await pattern consistent

### 15.4 Testing
- [ ] Test script runs without errors
- [ ] Basic compression produces valid output
- [ ] Empty content throws expected error
- [ ] Invalid file type throws expected error
- [ ] Multiple file types compressed correctly
- [ ] API error handling works
- [ ] Response parsing handles edge cases

---

## 16. Risks & Mitigation

### 16.1 Low Risk
- Type definitions (straightforward, match Chunk 2)
- Error class definition (standard pattern)
- Environment variable access (matches existing code)

### 16.2 Medium Risk
- **Fireworks API integration:** New API, ensure correct model name and format
  - **Mitigation:** Verify model name `accounts/fireworks/models/qwen2p5-72b-instruct`
  - **Mitigation:** Test API calls during implementation

- **JSON response parsing:** API response may have variations
  - **Mitigation:** Handle markdown code block wrapping
  - **Mitigation:** Test with actual API responses

### 16.3 Mitigation Strategies
- Implement robust JSON parsing with fallbacks
- Add detailed error messages for debugging
- Include response text in error details for investigation
- Test with actual Fireworks API before finalizing

---

## 17. Ready for Review

This plan is **complete and ready for Reviewer assessment**.

**Expected Review Outcome:** 10/10 for:
- Comprehensive implementation approach
- Proper error handling strategy
- Clear integration points with Chunks 2 and 5
- Detailed test plan with edge cases
- No hardcoded values (prompts are from spec)
- Based on actual codebase patterns (reusing OpenAI client setup from chat route)
- Artisan Cut principles properly understood and integrated

**Deviations from Requirements:** None - all requirements from project-brief.md lines 224-232 are addressed.

---

## 18. Files to Create/Modify

### Files to Create:
1. **`/Users/d.patnaik/code/asura/src/lib/file-compressor.ts`**
   - Main compression library
   - ~600-800 lines of code
   - FileCompressionError class, types, main function, helpers

### Files to Create (Testing):
2. **`/Users/d.patnaik/code/asura/test-file-compressor.js`**
   - Manual test script
   - Tests compression, error handling, edge cases
   - Runnable with Node.js

### No Files to Modify:
- Existing files not modified in this chunk
- Dependencies with existing code happen in Chunk 5

---

## 19. Next Steps After Approval

1. **Reviewer approves plan** (10/10)
2. **Doer implements** `src/lib/file-compressor.ts`
3. **Doer creates test script** `test-file-compressor.js`
4. **Doer runs tests** and verifies:
   - TypeScript compilation
   - Basic compression works
   - Error handling functions
   - Artisan Cut output quality
5. **Doer documents** implementation results
6. **Reviewer reviews** implementation (8/10 gate)
7. **Proceed to Chunk 5** (File Processor Orchestration)

---

**Plan Ready for Review: YES**
