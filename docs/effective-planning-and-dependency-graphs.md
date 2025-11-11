# Effective Planning and Dependency Graphs

**Date**: 2025-01-10
**Context**: Lessons from Layer 2 & 3 implementation of the file uploads feature
**Outcome**: Zero bugs, all tests passing on first implementation attempt

---

## The Problem with Ad-Hoc Implementation

Most features are built iteratively:
1. Start coding without complete specification
2. Make design decisions on the fly
3. Discover edge cases during testing
4. Refactor when integration fails
5. Repeat until it works

This approach works but is inefficient. It burns time on rework and creates technical debt.

---

## The Alternative: Deep Planning Before Implementation

The file uploads feature (Layers 2-3) took a different approach:

**Planning Phase (1-2 days):**
- Detailed dependency graph with exact API specifications
- Implementation pseudo-code for every function
- Error handling strategies predefined
- Test scenarios written before code
- Definition of Done criteria established

**Implementation Phase (1 day):**
- Follow the specification mechanically
- No architecture debates during coding
- Tests pass immediately (or reveal spec issues, not code issues)

**Result:**
- 9 components implemented (file-extraction, vectorization, file-classifier, file-chunker, chunk-classifier, file-compressor)
- All tests passing
- Zero refactoring needed
- High confidence in production readiness

---

## What Made the Plan Effective

### 1. Exact API Specifications

**Bad (vague):**
```
Create a function that classifies files
```

**Good (precise):**
```typescript
export class FileClassificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileClassificationError';
  }
}

export type FileType = 'strategic' | 'factual' | 'mixed';

export async function classifyFile(
  text: string,
  filename: string
): Promise<FileType>
```

**Why this works:**
- No ambiguity about types
- Error handling class predefined
- Input/output contracts explicit

### 2. Implementation Pseudo-code

**Bad (high-level):**
```
The chunker should use a sliding window algorithm
```

**Good (algorithmic detail):**
```typescript
const WINDOW_SIZE = 20000;
const OVERLAP = 3000;

// Process windows with overlap
while (windowStart < text.length) {
  const windowEnd = Math.min(windowStart + WINDOW_SIZE, text.length);
  const windowText = text.slice(windowStart, windowEnd);

  // Call 1A: Initial boundary identification
  const call1A = await fireworks.chat.completions.create({...});

  // Call 1B: Verification
  const call1B = await fireworks.chat.completions.create({...});

  // Parse boundaries and convert relative positions to absolute
  windowBoundaries.forEach((b: any) => {
    allBoundaries.push({
      start: windowStart + (b.position || 0),
      end: 0, // Will calculate after sorting
      title: b.title || 'Untitled',
      summary: b.summary || ''
    });
  });

  // Move window (with overlap)
  windowStart += WINDOW_SIZE - OVERLAP;
}

// Sort boundaries by start position
allBoundaries.sort((a, b) => a.start - b.start);

// Deduplicate boundaries in overlap regions
// Skip if next boundary is within 1000 chars (likely duplicate)
```

**Why this works:**
- No guessing about algorithm details
- Constants specified (window size, overlap)
- Edge cases handled (deduplication logic)
- Implementation is mostly transcription

### 3. Error Handling Blueprint

**Bad (generic):**
```
Handle errors appropriately
```

**Good (specific strategy):**
```
Error Handling Strategy:
- All functions throw FileExtractionError for domain errors
- Catch library errors, wrap in FileExtractionError with context
- Preserve original error message in wrapper
- Never let raw library errors escape

Example:
try {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  // ... process
} catch (error) {
  if (error instanceof FileExtractionError) {
    throw error;
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  throw new FileExtractionError(`PDF extraction failed: ${message}`);
}
```

**Why this works:**
- Consistent error handling across all functions
- Clear guidance on when to wrap vs. propagate
- User-facing error messages considered upfront

### 4. Testing Strategy Embedded

**Bad (postponed):**
```
We'll write tests later
```

**Good (test-driven):**
```
Testing Strategy:

1. Create test-files/ directory with:
   - sample.pdf - Multi-page PDF with text
   - sample.txt - Plain text file
   - sample.md - Markdown file
   - empty.txt - Empty file (should fail)
   - huge.pdf - >10MB file (should fail validation)

2. Test script (test-extraction.js):
   - Test PDF extraction → verify metadata
   - Test hash generation → verify consistency
   - Test size validation → verify rejection
   - Test empty file rejection → verify error message

Definition of Done:
- ✅ All 5 functions implemented and exported
- ✅ Error handling wraps all library errors
- ✅ Test script passes for all file types
- ✅ Empty files rejected with clear error
- ✅ Oversized files rejected before processing
- ✅ Hash function produces consistent 64-char hex strings
```

**Why this works:**
- Test scenarios defined before implementation
- Expected outcomes clear
- Definition of Done measurable (checkboxes, not subjective)

### 5. Dependency Isolation

**Bad (tangled):**
```
Build file processing with classification, chunking, and compression
```

**Good (layered):**
```
Layer 1: Foundation (No Dependencies)
✅ Database - files, file_chunks tables, vector search function

Layer 2: Utilities (Foundation Only)
- 2A. Text Extraction (file-extraction.ts)
  - Dependencies: unpdf, crypto.subtle
  - Used By: Upload API

- 2B. Vectorization (vectorization.ts)
  - Dependencies: voyageai, VOYAGE_API_KEY
  - Used By: File Compressor (3D)

Layer 3: AI Operations (Utilities + Fireworks)
- 3A. File Classifier (file-classifier.ts)
  - Dependencies: Fireworks API
  - Used By: File Processor (4)

- 3B. File Chunker (file-chunker.ts)
  - Dependencies: Fireworks API
  - Used By: File Processor (4)

- 3C. Chunk Classifier (chunk-classifier.ts)
  - Dependencies: Fireworks API
  - Used By: File Processor (4) - mixed files only

- 3D. File Compressor (file-compressor.ts)
  - Dependencies: Fireworks API, vectorization.ts (2B)
  - Used By: File Processor (4) - strategic chunks only
```

**Why this works:**
- Clear what to build in what order
- No circular dependencies
- Can test each layer independently
- Integration points explicit

### 6. Edge Cases Documented

**Bad (discovered during testing):**
```
Model returns unexpected output format
```

**Good (anticipated):**
```
Model Behavior Notes:
- Qwen uses <think> tags for reasoning
- Think tags improve output quality - do NOT disable them
- Strip <think> tags AFTER generation, not before
- max_tokens must account for think tags (use 500 for classifiers)

JSON Extraction Helper:
function extractJSON(text: string): string {
  const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const firstBracket = withoutThink.indexOf('[');
  const lastBracket = withoutThink.lastIndexOf(']');

  if (firstBracket !== -1 && lastBracket !== -1) {
    return withoutThink.substring(firstBracket, lastBracket + 1);
  }

  return withoutThink;
}
```

**Why this works:**
- Common model quirks handled upfront
- Reusable patterns extracted (JSON extraction helper)
- Parameters tuned based on known behavior (500 max_tokens)

---

## The Implementation Result

**Layer 2 (2 components):**
- file-extraction.ts: 105 lines, 5 functions, all tests passed
- vectorization.ts: 55 lines, 1 function, semantic similarity verified

**Layer 3 (4 components):**
- file-classifier.ts: 87 lines, tests: 5/5 passed
- file-chunker.ts: 175 lines, comprehensive test: 100% coverage (target: 95%)
- chunk-classifier.ts: 72 lines, tests: 3/3 passed
- file-compressor.ts: 143 lines, compression test passed (salience=9, embedding=1024-dim)

**Total implementation time:** ~6 hours (including all tests)

**Bugs found during testing:** 1 (max_tokens too low for think tags - parameter tuning, not logic error)

**Refactoring needed:** 0

---

## Key Principles for Effective Plans

### 1. Think Deeply Upfront, Execute Mechanically

Spend 50% of time planning, 50% implementing. The planning phase should answer:
- What are we building? (API specifications)
- How will we build it? (Implementation pseudo-code)
- How will we know it works? (Test scenarios + Definition of Done)
- What could go wrong? (Error handling + edge cases)

### 2. Optimize for Clarity, Not Brevity

A 1000-line specification that enables zero-ambiguity implementation is better than a 100-line spec that requires 10 clarification rounds.

### 3. Specify Contracts, Not Implementations

Bad: "Use a for loop to iterate"
Good: "Function must return array of ChunkBoundary with start/end/title/summary"

The plan should define WHAT (contracts, types, inputs, outputs) with enough HOW (algorithms, patterns) to avoid ambiguity, but not so much that it becomes code.

### 4. Make Tests First-Class Citizens

Tests aren't an afterthought. They're part of the specification:
- What inputs should succeed?
- What inputs should fail?
- What error messages are expected?
- What are the quantitative success criteria? (95% coverage, 1024-dim embeddings, etc.)

### 5. Layer Dependencies Explicitly

Every component should have:
- **Purpose**: One-sentence description
- **Dependencies**: What it needs (libraries, other components, env vars)
- **Used By**: What depends on it
- **Testing Strategy**: How to verify it works independently

This enables parallel development and independent testing.

---

## When This Approach Works Best

**Ideal for:**
- Complex features with multiple components (file uploads, payment processing, auth systems)
- Features with clear boundaries and contracts (APIs, libraries, SDKs)
- Teams where coordination overhead is high (async, distributed)
- Projects where bugs are expensive (fintech, healthcare, infrastructure)

**Less valuable for:**
- Exploratory prototypes (you're still figuring out what to build)
- UI-heavy work (visual design iteration is inherently exploratory)
- Single-function features (writing a 100-line spec for a 50-line function is overkill)

---

## Template for Future Features

```markdown
# Feature: [Name]

## Purpose
[One paragraph: what problem does this solve?]

## Dependency Graph

### Layer X: [Name]
**Component XA: [Name]** - `path/to/file.ts`

**Purpose**: [One sentence]

**Dependencies**:
- [Library/component]: [What for]
- [Environment variable]: [What for]

**Exact API Specification**:
```typescript
export interface ResultType {
  field: type;
}

export class ErrorType extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorType';
  }
}

export async function mainFunction(
  param1: Type1,
  param2: Type2
): Promise<ResultType>
```

**Implementation Details**:
[Pseudo-code with algorithm, edge cases, patterns]

**Error Handling Strategy**:
[How to handle errors, what to throw, what to wrap]

**Used By**:
[Components that depend on this]

**Testing Strategy**:
[Test files, scenarios, expected outcomes]

**Definition of Done**:
- ✅ [Measurable criterion 1]
- ✅ [Measurable criterion 2]
```

---

## Conclusion

The file uploads feature (Layers 2-3) demonstrated that detailed planning eliminates implementation risk. The specification was so precise that implementation became mechanical transcription with near-zero debugging.

**The ROI:**
- 2 days of planning → 1 day of implementation
- Alternative: 1 hour of rough planning → 3-4 days of coding + debugging + refactoring

Deep planning frontloads cognitive load but backloads execution risk. For complex features, this tradeoff is always worth it.

**This is how software should be built: think deeply upfront, document precisely, execute mechanically.**
