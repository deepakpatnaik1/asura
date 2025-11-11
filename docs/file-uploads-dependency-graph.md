# File Uploads: Dependency Graph & Integration Plan

**Purpose**: Map dependencies, integration points, and testing boundaries for file upload implementation

**Created**: 2025-11-10
**Design Reference**: [file-uploads-design.md](./file-uploads-design.md)
**Implementation Tracker**: [file-uploads-implementation.md](./file-uploads-implementation.md)

---

## Component Dependency Map

### Layer 1: Foundation (No Dependencies)
✅ **Database** - `files`, `file_chunks` tables, vector search function
- Status: COMPLETE (reused from previous branch)
- Dependencies: None
- Integration: Supabase migrations already applied

### Layer 2: Utilities (Foundation Only)

**2A. Text Extraction** - `src/lib/file-extraction.ts`

**Purpose**: Convert file buffers to plain text with metadata

**Dependencies**:
- `unpdf` npm package (install: `npm install unpdf`)
- Node.js built-in `crypto.subtle` for hashing

**Exact API Specification**:

```typescript
// Types to export
export interface ExtractionResult {
  text: string;
  metadata: {
    pageCount?: number;  // Only for PDFs
    wordCount: number;
    charCount: number;
  };
}

export class FileExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileExtractionError';
  }
}

// Main function
export async function extractText(
  buffer: Buffer,
  filename: string
): Promise<ExtractionResult>

// Utility functions
export function validateFileSize(
  buffer: Buffer,
  maxSizeMB: number = 10
): void  // Throws FileExtractionError if too large

export async function generateContentHash(
  buffer: Buffer
): Promise<string>  // Returns SHA-256 hex string
```

**Implementation Details**:

1. **extractText()**: Route by file extension
   - Get extension: `filename.toLowerCase().split('.').pop()`
   - Switch on extension: 'pdf' → extractFromPDF(), 'txt'|'md' → extractFromText()
   - Throw FileExtractionError for unsupported types

2. **extractFromPDF()** (internal):
   ```typescript
   import { getDocumentProxy, extractText as unpdfExtractText } from 'unpdf';

   const pdf = await getDocumentProxy(new Uint8Array(buffer));
   const { text, totalPages } = await unpdfExtractText(pdf, { mergePages: true });
   await pdf.destroy();  // Important: cleanup

   // Validate non-empty
   if (!text.trim()) throw FileExtractionError

   return {
     text: text.trim(),
     metadata: {
       pageCount: totalPages,
       wordCount: text.split(/\s+/).length,
       charCount: text.length
     }
   };
   ```

3. **extractFromText()** (internal):
   ```typescript
   const text = buffer.toString('utf-8').trim();

   if (!text) throw FileExtractionError('File is empty');

   return {
     text,
     metadata: {
       wordCount: text.split(/\s+/).length,
       charCount: text.length
     }
   };
   ```

4. **validateFileSize()**:
   ```typescript
   const maxBytes = maxSizeMB * 1024 * 1024;
   if (buffer.length > maxBytes) {
     throw new FileExtractionError(`File exceeds ${maxSizeMB}MB limit`);
   }
   ```

5. **generateContentHash()**:
   ```typescript
   const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
   const hashArray = Array.from(new Uint8Array(hashBuffer));
   return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
   ```

**Error Handling Strategy**:
- All functions throw `FileExtractionError` for domain errors
- Catch library errors, wrap in FileExtractionError with context
- Preserve original error message in wrapper
- Never let raw library errors escape

**Used By**:
- Upload API (`/api/files/upload/+server.ts`) - first step in pipeline

**Testing Strategy**:
1. Create `test-files/` directory with:
   - `sample.pdf` - Multi-page PDF with text
   - `sample.txt` - Plain text file
   - `sample.md` - Markdown file
   - `empty.txt` - Empty file (should fail)
   - `huge.pdf` - >10MB file (should fail validation)

2. Test script (`test-extraction.js`):
   ```javascript
   import { extractText, validateFileSize, generateContentHash } from './src/lib/file-extraction.ts';
   import { readFile } from 'fs/promises';

   // Test PDF extraction
   const pdfBuffer = await readFile('test-files/sample.pdf');
   const result = await extractText(pdfBuffer, 'sample.pdf');
   console.log('PDF:', result.metadata);

   // Test hash generation
   const hash1 = await generateContentHash(pdfBuffer);
   const hash2 = await generateContentHash(pdfBuffer);
   console.assert(hash1 === hash2, 'Hashes should match');

   // Test size validation
   try {
     validateFileSize(Buffer.alloc(11 * 1024 * 1024), 10);
     console.error('Should have thrown!');
   } catch (e) {
     console.log('Size validation works:', e.message);
   }
   ```

**Definition of Done**:
- ✅ All 5 functions implemented and exported
- ✅ Error handling wraps all library errors
- ✅ Test script passes for all file types
- ✅ Empty files rejected with clear error
- ✅ Oversized files rejected before processing
- ✅ Hash function produces consistent 64-char hex strings

---

**2B. Vectorization** - `src/lib/vectorization.ts`

**Purpose**: Convert text strings to 1024-dimensional embeddings for semantic search

**Dependencies**:
- `voyageai` npm package (install: `npm install voyageai`)
- `VOYAGE_API_KEY` environment variable

**Exact API Specification**:

```typescript
export class VectorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VectorizationError';
  }
}

export async function generateEmbedding(
  text: string
): Promise<number[]>  // Returns array of exactly 1024 numbers
```

**Implementation Details**:

```typescript
import { VoyageAIClient } from 'voyageai';

// Initialize client (reuse across calls)
const voyageClient = new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY
});

export async function generateEmbedding(text: string): Promise<number[]> {
  // Validate input
  if (!text || text.trim().length === 0) {
    throw new VectorizationError('Cannot generate embedding for empty text');
  }

  // Validate API key
  if (!process.env.VOYAGE_API_KEY) {
    throw new VectorizationError('VOYAGE_API_KEY environment variable not set');
  }

  try {
    const response = await voyageClient.embed({
      input: text,
      model: 'voyage-3',  // 1024-dimensional embeddings, $0.06/M tokens
      inputType: 'document'     // For storage/retrieval
    });

    const embedding = response.data[0].embedding;

    // Validate output
    if (!Array.isArray(embedding) || embedding.length !== 1024) {
      throw new VectorizationError(
        `Expected 1024-dim embedding, got ${embedding?.length || 0}`
      );
    }

    return embedding;

  } catch (error) {
    if (error instanceof VectorizationError) {
      throw error;
    }

    // Wrap API errors
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new VectorizationError(`Voyage AI API error: ${message}`);
  }
}
```

**Voyage AI API Details**:
- Model: `voyage-3`
- Dimensions: 1024
- Cost: $0.06 per million tokens
- Input type: `document` (for files/conversations to be stored)
- Alternative input type: `query` (for search queries) - not used yet
- Rate limits: Check Voyage AI dashboard
- Max input length: 32K tokens

**Error Handling Strategy**:
- Validate inputs before API call
- Check API key presence
- Validate output dimensions
- Wrap all API errors in VectorizationError
- Include original error context in message

**Environment Setup**:
1. Sign up at https://www.voyageai.com/
2. Get API key from dashboard
3. Add to `.env`: `VOYAGE_API_KEY=your_key_here`
4. Verify key loads: `console.log(process.env.VOYAGE_API_KEY ? 'Set' : 'Missing')`

**Used By**:
- File Compressor (Layer 3D) - embed decision arcs
- File Processor (Layer 4) - embed factual chunks
- Future: Query processing for semantic search

**Testing Strategy**:

1. Test script (`test-vectorization.js`):
   ```javascript
   import { generateEmbedding } from './src/lib/vectorization.ts';

   // Test basic embedding
   const text = 'The founder pivoted from B2B to B2C after user research.';
   const embedding = await generateEmbedding(text);

   console.log('Embedding dimensions:', embedding.length);
   console.assert(embedding.length === 1024, 'Must be 1024-dim');
   console.assert(embedding.every(n => typeof n === 'number'), 'All numbers');

   // Test semantic similarity (same meaning)
   const emb1 = await generateEmbedding('pricing strategy');
   const emb2 = await generateEmbedding('cost model');
   const emb3 = await generateEmbedding('weather forecast');

   function cosineSimilarity(a, b) {
     const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
     const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
     const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
     return dot / (magA * magB);
   }

   const sim12 = cosineSimilarity(emb1, emb2);
   const sim13 = cosineSimilarity(emb1, emb3);

   console.log('Pricing vs Cost similarity:', sim12);
   console.log('Pricing vs Weather similarity:', sim13);
   console.assert(sim12 > sim13, 'Related terms should be more similar');

   // Test error handling
   try {
     await generateEmbedding('');
     console.error('Should reject empty string!');
   } catch (e) {
     console.log('Empty string rejected:', e.message);
   }
   ```

2. Manual verification:
   - Check Voyage AI dashboard for usage
   - Confirm API key works
   - Verify embeddings return quickly (<1 second)

**Integration Notes**:
- Client reused across calls (don't recreate per request)
- Embeddings are deterministic (same text → same embedding)
- Store embeddings as `VECTOR(1024)` in Postgres
- Use pgvector's cosine distance: `embedding <=> query_embedding`

**Definition of Done**:
- ✅ VoyageAIClient initialized correctly
- ✅ generateEmbedding() returns exactly 1024 numbers
- ✅ Empty string rejected with clear error
- ✅ Missing API key detected and reported
- ✅ API errors wrapped in VectorizationError
- ✅ Test script passes semantic similarity check
- ✅ Voyage AI dashboard shows successful API calls

### Layer 3: AI Operations (Utilities + Fireworks)

**3A. File Classifier** - `src/lib/file-classifier.ts`

**Purpose**: Classify entire file as strategic, factual, or mixed to route processing

**Dependencies**:
- OpenAI client pointing to Fireworks API
- `FIREWORKS_API_KEY` environment variable (already exists)

**Exact API Specification**:

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

**Implementation Details**:

```typescript
import OpenAI from 'openai';
import { FIREWORKS_API_KEY } from '$env/static/private';

const fireworks = new OpenAI({
  baseURL: 'https://api.fireworks.ai/inference/v1',
  apiKey: FIREWORKS_API_KEY
});

const CLASSIFICATION_PROMPT = `Classify this document into one of three types:

**STRATEGIC**: Documents requiring deep understanding and synthesis
- Journal entries, reflections, strategic thinking
- Interview transcripts (focus on insights, not just data)
- Strategic planning documents
- Retrospectives, lessons learned
- Decision logs with reasoning

**FACTUAL**: Documents requiring accurate lookup and retrieval
- Industry reports, research papers
- Financial statements, data tables
- Reference materials, specifications
- Product documentation (features, not philosophy)
- Meeting notes (action items, not strategic discussions)

**MIXED**: Documents with BOTH strategic insights AND factual data
- Expert interviews with recommendations + supporting data
- Strategic reports with embedded statistics
- Planning documents with both vision and detailed metrics

Return ONLY the classification: "strategic", "factual", or "mixed" (no explanation).`;

export async function classifyFile(
  text: string,
  filename: string
): Promise<FileType> {
  // Validate inputs
  if (!text || text.trim().length === 0) {
    throw new FileClassificationError('Cannot classify empty text');
  }

  if (!FIREWORKS_API_KEY) {
    throw new FileClassificationError('FIREWORKS_API_KEY not set');
  }

  try {
    const response = await fireworks.chat.completions.create({
      model: 'accounts/fireworks/models/qwen3-235b-a22b',
      messages: [
        {
          role: 'system',
          content: CLASSIFICATION_PROMPT
        },
        {
          role: 'user',
          content: `Filename: ${filename}\n\nContent:\n${text.slice(0, 5000)}` // First 5K chars sufficient
        }
      ],
      max_tokens: 1000, // Accommodate <think> tags from Qwen models
      temperature: 0.1 // Low temp for consistent classification
    });

    // Extract result and strip <think> tags
    let result = response.choices[0]?.message?.content?.trim() || '';
    result = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim().toLowerCase();

    // Validate response
    if (result === 'strategic' || result === 'factual' || result === 'mixed') {
      return result as FileType;
    }

    throw new FileClassificationError(
      `Invalid classification response: "${result}"`
    );

  } catch (error) {
    if (error instanceof FileClassificationError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new FileClassificationError(`Fireworks API error: ${message}`);
  }
}
```

**Classification Criteria**:
- Strategic: Requires synthesis, understanding of reasoning/decisions
- Factual: Requires accurate lookup, data preservation
- Mixed: Contains both (chunk-level classification needed)

**Used By**:
- File Processor (Layer 4) - determines processing route

**Testing Strategy**:

1. Test script (`test-file-classifier.js`):
   ```javascript
   import { classifyFile } from './src/lib/file-classifier.ts';
   import { readFile } from 'fs/promises';

   // Test strategic document
   const strategic = await readFile('test-files/strategic-journal.md', 'utf-8');
   const result1 = await classifyFile(strategic, 'strategic-journal.md');
   console.assert(result1 === 'strategic', 'Should classify as strategic');

   // Test factual document
   const factual = await readFile('test-files/industry-report.md', 'utf-8');
   const result2 = await classifyFile(factual, 'industry-report.md');
   console.assert(result2 === 'factual', 'Should classify as factual');

   // Test mixed document
   const mixed = await readFile('test-files/expert-interview.md', 'utf-0');
   const result3 = await classifyFile(mixed, 'expert-interview.md');
   console.assert(result3 === 'mixed', 'Should classify as mixed');

   console.log('All classification tests passed');
   ```

2. Create test files in `test-files/`:
   - `strategic-journal.md` - Clear strategic content
   - `industry-report.md` - Clear factual content
   - `expert-interview.md` - Mixed strategic + factual

**Definition of Done**:
- ✅ classifyFile() returns valid FileType
- ✅ Empty text rejected with clear error
- ✅ API errors wrapped in FileClassificationError
- ✅ Test script passes for all three types
- ✅ Classification consistent across multiple runs (low temperature)
- ✅ Only uses first 5K characters (efficient)

---

**3B. File Chunker** - `src/lib/file-chunker.ts`

**Purpose**: Split file into logical chunks using sliding window + Call 1A/1B per window

**Dependencies**:
- OpenAI client pointing to Fireworks API
- `FIREWORKS_API_KEY` environment variable

**Exact API Specification**:

```typescript
export class FileChunkingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileChunkingError';
  }
}

export interface ChunkBoundary {
  start: number;      // Character index in original text
  end: number;        // Character index in original text
  title: string;      // Chunk title/topic (from Call 1B)
  summary: string;    // Chunk summary (from Call 1B)
}

export async function chunkFile(
  text: string,
  filename: string
): Promise<ChunkBoundary[]>
```

**Implementation Details**:

**Sliding Window Algorithm**:
- Window size: 20,000 characters
- Overlap: 3,000 characters (prevents information loss at boundaries)
- Call 1A → Call 1B per window
- Merge overlapping boundaries intelligently

```typescript
import OpenAI from 'openai';
import { FIREWORKS_API_KEY } from '$env/static/private';

const fireworks = new OpenAI({
  baseURL: 'https://api.fireworks.ai/inference/v1',
  apiKey: FIREWORKS_API_KEY
});

const WINDOW_SIZE = 20000;
const OVERLAP = 3000;

const CALL1A_CHUNKING_PROMPT = `You will receive a window of text from a larger document.

Your task: Identify natural chunk boundaries within this window.

A chunk boundary is where:
- Topic changes significantly
- New section/chapter begins
- Conversation shifts to new subject
- Time period changes
- Different event/decision begins

For each boundary you find:
1. Identify the character position (approximate index in the text)
2. Give it a title (3-8 words describing the topic)
3. Write a 1-sentence summary

Return JSON array:
[
  {
    "position": <character index>,
    "title": "...",
    "summary": "..."
  }
]

CRITICAL: Only identify boundaries YOU ARE CONFIDENT ABOUT. If the window seems to be one continuous topic, return [].`;

const CALL1B_CHUNKING_PROMPT = `Review the chunk boundaries identified in Call 1A.

Verify:
- Are boundaries at real topic shifts?
- Are titles accurate and specific?
- Are summaries capturing the essence?

Remove any weak/uncertain boundaries. Improve titles and summaries.

Return the IMPROVED JSON array (same format).`;

export async function chunkFile(
  text: string,
  filename: string
): Promise<ChunkBoundary[]> {
  if (!text || text.trim().length === 0) {
    throw new FileChunkingError('Cannot chunk empty text');
  }

  if (!FIREWORKS_API_KEY) {
    throw new FileChunkingError('FIREWORKS_API_KEY not set');
  }

  const allBoundaries: ChunkBoundary[] = [];
  let windowStart = 0;

  try {
    // Process windows with overlap
    while (windowStart < text.length) {
      const windowEnd = Math.min(windowStart + WINDOW_SIZE, text.length);
      const windowText = text.slice(windowStart, windowEnd);

      console.log(`[Chunking] Processing window ${windowStart}-${windowEnd}`);

      // Call 1A: Initial boundary identification
      const call1A = await fireworks.chat.completions.create({
        model: 'accounts/fireworks/models/qwen3-235b-a22b',
        messages: [
          { role: 'system', content: CALL1A_CHUNKING_PROMPT },
          { role: 'user', content: `Filename: ${filename}\n\nWindow text:\n${windowText}` }
        ],
        max_tokens: 2048,
        temperature: 0.3
      });

      const call1AOutput = call1A.choices[0]?.message?.content || '[]';

      // Call 1B: Verification
      const call1B = await fireworks.chat.completions.create({
        model: 'accounts/fireworks/models/qwen3-235b-a22b',
        messages: [
          { role: 'system', content: CALL1A_CHUNKING_PROMPT },
          { role: 'assistant', content: call1AOutput },
          { role: 'user', content: CALL1B_CHUNKING_PROMPT }
        ],
        max_tokens: 2048,
        temperature: 0.3
      });

      const call1BOutput = call1B.choices[0]?.message?.content || '[]';

      // Parse boundaries with retry logic
      let windowBoundaries: any[];
      try {
        const cleanedJSON = extractJSON(call1BOutput);
        windowBoundaries = JSON.parse(cleanedJSON);
      } catch (parseError) {
        // Retry once with stricter instructions
        console.warn(`[Chunking] JSON parse failed for window ${windowStart}, retrying...`);

        const retryCall1B = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FIREWORKS_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'accounts/fireworks/models/qwen2p5-72b-instruct',
            messages: [
              { role: 'system', content: 'Output ONLY valid JSON array. No explanations.' },
              call1AMessages[1] // Re-use original user message
            ],
            max_tokens: 2048,
            temperature: 0.1 // Lower temp for stricter output
          })
        });

        const retryOutput = (await retryCall1B.json()).choices[0]?.message?.content || '[]';

        try {
          windowBoundaries = JSON.parse(extractJSON(retryOutput));
        } catch (retryError) {
          throw new FileChunkingError(
            `Failed to parse chunk boundaries after retry. File may be malformed or too complex.`
          );
        }
      }

      // Convert relative positions to absolute
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

    // Deduplicate boundaries in overlap regions (keep first occurrence)
    const deduped: ChunkBoundary[] = [];
    for (let i = 0; i < allBoundaries.length; i++) {
      const current = allBoundaries[i];
      const next = allBoundaries[i + 1];

      // Skip if next boundary is within 1500 chars (likely duplicate from overlap)
      // Threshold is half of overlap window (3000 chars) to avoid false positives
      if (next && Math.abs(next.start - current.start) < 1500) {
        continue;
      }

      deduped.push(current);
    }

    // Calculate end positions
    for (let i = 0; i < deduped.length; i++) {
      deduped[i].end = deduped[i + 1]?.start || text.length;
    }

    // Always have at least 1 chunk (entire file)
    if (deduped.length === 0) {
      deduped.push({
        start: 0,
        end: text.length,
        title: `Full document: ${filename}`,
        summary: 'Entire file as single chunk'
      });
    }

    console.log(`[Chunking] Created ${deduped.length} chunks`);
    return deduped;

  } catch (error) {
    if (error instanceof FileChunkingError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new FileChunkingError(`Chunking failed: ${message}`);
  }
}

// Helper: Extract JSON from response (handles <think> tags)
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

**Algorithm Details**:
1. Slide 20K-character window across file with 3K overlap
2. Call 1A identifies boundaries within window
3. Call 1B verifies and improves boundaries
4. Merge results, deduplicate boundaries in overlap regions
5. Calculate chunk end positions from next chunk's start

**Coverage Target**: 95%+ of file covered by meaningful chunks

**Used By**:
- File Processor (Layer 4)

**Testing Strategy**:

1. Test with real 65K document in `test-chunking/input/`
2. Verify coverage: `sum(chunk.end - chunk.start) / text.length >= 0.95`
3. Verify no overlapping chunks
4. Verify chunk boundaries make semantic sense
5. Check test-chunking/output/ for actual results

**Definition of Done**:
- ✅ chunkFile() returns array of ChunkBoundary
- ✅ Sliding window covers entire file
- ✅ Overlap prevents information loss
- ✅ Deduplication removes redundant boundaries
- ✅ 95%+ coverage on test documents
- ✅ Chunk titles and summaries are meaningful

---

**3C. Chunk Classifier** - `src/lib/chunk-classifier.ts`

**Purpose**: Classify individual chunks as strategic or factual (for mixed files only)

**Dependencies**:
- OpenAI client pointing to Fireworks API
- `FIREWORKS_API_KEY` environment variable

**Exact API Specification**:

```typescript
export class ChunkClassificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChunkClassificationError';
  }
}

export type ChunkType = 'strategic' | 'factual';

export async function classifyChunk(
  text: string
): Promise<ChunkType>
```

**Implementation Details**:

```typescript
import OpenAI from 'openai';
import { FIREWORKS_API_KEY } from '$env/static/private';

const fireworks = new OpenAI({
  baseURL: 'https://api.fireworks.ai/inference/v1',
  apiKey: FIREWORKS_API_KEY
});

const CHUNK_CLASSIFICATION_PROMPT = `Classify this chunk of text as either "strategic" or "factual":

**STRATEGIC**: Content requiring deep understanding
- Decision-making processes and reasoning
- Strategic insights, reflections, lessons learned
- Opinions, perspectives, mental models
- "Why" behind choices

**FACTUAL**: Content requiring accurate lookup
- Data, statistics, numbers, metrics
- Product specifications, feature lists
- Factual statements, definitions
- "What" without deep "why"

Return ONLY: "strategic" or "factual" (no explanation).`;

export async function classifyChunk(text: string): Promise<ChunkType> {
  if (!text || text.trim().length === 0) {
    throw new ChunkClassificationError('Cannot classify empty chunk');
  }

  if (!FIREWORKS_API_KEY) {
    throw new ChunkClassificationError('FIREWORKS_API_KEY not set');
  }

  try {
    const response = await fireworks.chat.completions.create({
      model: 'accounts/fireworks/models/qwen3-235b-a22b',
      messages: [
        { role: 'system', content: CHUNK_CLASSIFICATION_PROMPT },
        { role: 'user', content: text.slice(0, 2000) } // First 2K sufficient
      ],
      max_tokens: 1000, // Accommodate <think> tags from Qwen models
      temperature: 0.1
    });

    // Extract result and strip <think> tags
    let result = response.choices[0]?.message?.content?.trim() || '';
    result = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim().toLowerCase();

    if (result === 'strategic' || result === 'factual') {
      return result as ChunkType;
    }

    throw new ChunkClassificationError(
      `Invalid classification: "${result}"`
    );

  } catch (error) {
    if (error instanceof ChunkClassificationError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new ChunkClassificationError(`Fireworks API error: ${message}`);
  }
}
```

**Used By**:
- File Processor (Layer 4) - only for mixed files

**Testing Strategy**:

```javascript
import { classifyChunk } from './src/lib/chunk-classifier.ts';

// Strategic chunk
const strategic = "We decided to pivot from B2B to B2C because our user research revealed that individual users had stronger pain points and willingness to pay.";
const r1 = await classifyChunk(strategic);
console.assert(r1 === 'strategic');

// Factual chunk
const factual = "The market size for cloud storage is $70B. AWS has 32% market share, Azure 21%, Google Cloud 10%.";
const r2 = await classifyChunk(factual);
console.assert(r2 === 'factual');
```

**Definition of Done**:
- ✅ classifyChunk() returns valid ChunkType
- ✅ Empty text rejected with clear error
- ✅ Test cases pass for strategic/factual chunks
- ✅ Consistent classification (low temperature)

---

**3D. File Compressor** - `src/lib/file-compressor.ts`

**Purpose**: Apply Artisan Cut compression to strategic chunks (Call 2A/2B)

**Dependencies**:
- OpenAI client pointing to Fireworks API
- `generateEmbedding` from vectorization.ts (Layer 2B)
- `FIREWORKS_API_KEY` environment variable

**Exact API Specification**:

```typescript
export class FileCompressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileCompressionError';
  }
}

export interface CompressedChunk {
  chunk_essence: string;
  decision_arc_summary: string;
  salience_score: number; // 1-10
  embedding: number[];    // 1024-dim vector
}

export async function compressChunk(
  text: string,
  filename: string,
  chunkIndex: number
): Promise<CompressedChunk>
```

**Implementation Details**:

```typescript
import OpenAI from 'openai';
import { FIREWORKS_API_KEY } from '$env/static/private';
import { generateEmbedding } from './vectorization';

const fireworks = new OpenAI({
  baseURL: 'https://api.fireworks.ai/inference/v1',
  apiKey: FIREWORKS_API_KEY
});

// Reuse existing Artisan Cut prompts (adapted for files)
const CALL2A_FILE_PROMPT = `ARTISAN CUT FOR FILES

You will receive a chunk of text from a file. Apply lossless compression.

KEEP IN FULL:
- Technical details, product features, business strategy
- Decision-making processes and reasoning ("why")
- Specific data: numbers, names, dates, percentages
- Strategic insights, lessons learned
- Key facts and conclusions

REMOVE:
- Filler words, grammatical padding
- Obvious repetitions
- Transitional phrases
- Examples used purely for illustration

DECISION ARC SUMMARY:
Generate a 50-150 character compressed summary capturing:
- Main decision or insight
- Pattern or principle revealed
- Key question or problem addressed

Format: Heavy punctuation (: ; , -) for compression

SALIENCE SCORE (1-10):
- 8-10: Critical strategic decisions, major insights
- 5-7: Important patterns, significant learnings
- 1-4: Contextual info, exploratory questions

Return JSON:
{
  "chunk_essence": "...",
  "decision_arc_summary": "...",
  "salience_score": <number>
}`;

const CALL2B_FILE_PROMPT = `Review the Artisan Cut for accuracy:
- Verify chunk_essence preserves all key information
- Verify decision_arc_summary is 50-150 characters
- Verify salience_score matches criteria (1-10)

Return ONLY the improved JSON (no extra text).`;

export async function compressChunk(
  text: string,
  filename: string,
  chunkIndex: number
): Promise<CompressedChunk> {
  if (!text || text.trim().length === 0) {
    throw new FileCompressionError('Cannot compress empty chunk');
  }

  if (!FIREWORKS_API_KEY) {
    throw new FileCompressionError('FIREWORKS_API_KEY not set');
  }

  try {
    console.log(`[Compression] Processing chunk ${chunkIndex} from ${filename}`);

    // Call 2A: Initial compression
    const call2A = await fireworks.chat.completions.create({
      model: 'accounts/fireworks/models/qwen3-235b-a22b',
      messages: [
        { role: 'system', content: CALL2A_FILE_PROMPT },
        { role: 'user', content: `File: ${filename}\nChunk ${chunkIndex}:\n\n${text}` }
      ],
      max_tokens: 2048,
      temperature: 0.3
    });

    const call2AOutput = call2A.choices[0]?.message?.content || '{}';

    // Call 2B: Verification
    const call2B = await fireworks.chat.completions.create({
      model: 'accounts/fireworks/models/qwen3-235b-a22b',
      messages: [
        { role: 'system', content: CALL2A_FILE_PROMPT },
        { role: 'assistant', content: call2AOutput },
        { role: 'user', content: CALL2B_FILE_PROMPT }
      ],
      max_tokens: 2048,
      temperature: 0.3
    });

    const call2BOutput = call2B.choices[0]?.message?.content || '{}';

    // Parse JSON
    const cleaned = extractJSON(call2BOutput);
    const compressed = JSON.parse(cleaned);

    // Validate fields
    if (!compressed.chunk_essence || !compressed.decision_arc_summary) {
      throw new FileCompressionError('Missing required fields in compression output');
    }

    if (typeof compressed.salience_score !== 'number' ||
        compressed.salience_score < 1 || compressed.salience_score > 10) {
      throw new FileCompressionError('Invalid salience_score (must be 1-10)');
    }

    // Validate decision_arc_summary length (50-150 chars as specified in design)
    const arcLength = compressed.decision_arc_summary.length;
    if (arcLength < 50 || arcLength > 150) {
      throw new FileCompressionError(
        `decision_arc_summary must be 50-150 chars, got ${arcLength}`
      );
    }

    // Generate embedding from decision arc
    const embedding = await generateEmbedding(compressed.decision_arc_summary);

    return {
      chunk_essence: compressed.chunk_essence,
      decision_arc_summary: compressed.decision_arc_summary,
      salience_score: compressed.salience_score,
      embedding
    };

  } catch (error) {
    if (error instanceof FileCompressionError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new FileCompressionError(`Compression failed: ${message}`);
  }
}

function extractJSON(text: string): string {
  const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const firstBrace = withoutThink.indexOf('{');
  const lastBrace = withoutThink.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1) {
    return withoutThink.substring(firstBrace, lastBrace + 1);
  }

  return withoutThink;
}
```

**Key Points**:
- Reuses Artisan Cut methodology from conversation compression
- Decision Arc = search key for vector search
- Chunk Essence = what gets injected into Call 1A context
- Embedding generated from Decision Arc (not raw text)

**Used By**:
- File Processor (Layer 4) - for strategic chunks only

**Testing Strategy**:

```javascript
import { compressChunk } from './src/lib/file-compressor.ts';

const strategicText = `
We faced a critical decision about our pricing model. The initial plan was to charge per-user per-month ($20/user), following the standard SaaS playbook. However, after running the numbers with our first 10 customers, we discovered they had wildly different team sizes (3-person startups vs 50-person agencies) but similar usage patterns.

The breakthrough came when Sarah pointed out that our value isn't tied to headcount—it's tied to projects managed. We pivoted to per-project pricing ($50/project/month) and immediately saw conversion rates jump from 8% to 23%. The agencies that balked at $1000/month for 50 users happily paid $200/month for 4 active projects.
`;

const result = await compressChunk(strategicText, 'pricing-decision.md', 0);

console.assert(result.chunk_essence.length > 0);
console.assert(result.decision_arc_summary.length >= 50);
console.assert(result.decision_arc_summary.length <= 150);
console.assert(result.salience_score >= 1 && result.salience_score <= 10);
console.assert(result.embedding.length === 1024);

console.log('Compression test passed');
console.log('Decision Arc:', result.decision_arc_summary);
console.log('Salience:', result.salience_score);
```

**Definition of Done**:
- ✅ compressChunk() returns valid CompressedChunk
- ✅ chunk_essence preserves key information
- ✅ decision_arc_summary is 50-150 characters
- ✅ salience_score is 1-10
- ✅ embedding is 1024-dimensional
- ✅ Call 2A → 2B verification pattern works
- ✅ Test case passes with realistic strategic content

### Layer 4: Orchestration (All AI Operations)

**4. File Processor** - `src/lib/file-processor.ts`

**Purpose**: Orchestrate the complete file processing pipeline with progress tracking and error handling

**Dependencies**:
- Layer 2A: `extractText`, `validateFileSize` from file-extraction.ts
  - Note: `generateContentHash` is NOT used in Layer 4 (used in Layer 5A Upload API for deduplication)
- Layer 2B: `generateEmbedding` from vectorization.ts
- Layer 3A: `classifyFile` from file-classifier.ts
- Layer 3B: `chunkFile` from file-chunker.ts
- Layer 3C: `classifyChunk` from chunk-classifier.ts
- Layer 3D: `compressChunk` from file-compressor.ts
- Supabase client for database operations
- `PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` environment variables

**Exact API Specification**:

```typescript
export class FileProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileProcessingError';
  }
}

export interface ProcessingProgress {
  stage: string;           // Current stage name
  progress: number;        // 0-100
  total_chunks?: number;
  processed_chunks?: number;
}

export type ProgressCallback = (progress: ProcessingProgress) => void | Promise<void>;

export async function processFile(
  fileId: string,
  buffer: Buffer,
  filename: string,
  onProgress?: ProgressCallback
): Promise<void>
```

**Implementation Details**:

**Pipeline Stages** (with progress calculation):
1. **Extraction** (0-10%): Extract text from file
2. **Classification** (10-15%): Classify file type
3. **Chunking** (15-25%): Split into logical chunks
4. **Processing** (25-95%): Process each chunk (strategic or factual)
5. **Completion** (95-100%): Finalize and mark ready

**Processing Routes**:

```typescript
import { extractText, validateFileSize } from './file-extraction';
import { generateEmbedding } from './vectorization';
import { classifyFile } from './file-classifier';
import { chunkFile } from './file-chunker';
import { classifyChunk } from './chunk-classifier';
import { compressChunk } from './file-compressor';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function processFile(
  fileId: string,
  buffer: Buffer,
  filename: string,
  onProgress?: ProgressCallback
): Promise<void> {

  // Helper: Update progress in database and call callback
  async function updateProgress(stage: string, progress: number, extra?: object) {
    const update: any = {
      processing_stage: stage,
      progress,
      ...extra
    };

    const { error } = await supabase
      .from('files')
      .update(update)
      .eq('id', fileId);

    if (error) {
      console.error(`[FileProcessor] Progress update failed:`, error);
    }

    if (onProgress) {
      await onProgress({ stage, progress, ...extra });
    }
  }

  // Helper: Mark file as failed
  async function markFailed(errorMessage: string) {
    await supabase
      .from('files')
      .update({
        status: 'failed',
        error_message: errorMessage,
        processing_stage: null,
        progress: 0
      })
      .eq('id', fileId);
  }

  try {
    // STAGE 1: Text Extraction (0-10%)
    await updateProgress('extracting', 5);

    validateFileSize(buffer, 10); // 10MB limit
    const { text, metadata } = await extractText(buffer, filename);

    await updateProgress('extraction_complete', 10);

    // STAGE 2: File Classification (10-15%)
    await updateProgress('classifying', 12);

    const fileType = await classifyFile(text, filename);

    // Update file_type in database
    await supabase
      .from('files')
      .update({ file_type: fileType })
      .eq('id', fileId);

    await updateProgress('classification_complete', 15);

    // STAGE 3: Chunking (15-25%)
    await updateProgress('chunking', 20);

    const boundaries = await chunkFile(text, filename);
    const totalChunks = boundaries.length;

    await supabase
      .from('files')
      .update({ total_chunks: totalChunks })
      .eq('id', fileId);

    await updateProgress('chunking_complete', 25, { total_chunks: totalChunks });

    // STAGE 4: Process Chunks (25-95%)
    // All-or-nothing: Collect all chunks first, then insert in single transaction
    // Progress allocation: 70% of total (25% → 95%)
    const progressPerChunk = 70 / totalChunks;
    const chunksToInsert = [];

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i];

      // Validate boundary (fail entire file if boundary is invalid)
      if (boundary.start >= boundary.end) {
        throw new FileProcessingError(
          `Invalid chunk boundary at index ${i}: start=${boundary.start}, end=${boundary.end}`
        );
      }

      const chunkText = text.slice(boundary.start, boundary.end);

      // Determine chunk type
      let chunkType: 'strategic' | 'factual';

      if (fileType === 'strategic') {
        chunkType = 'strategic';
      } else if (fileType === 'factual') {
        chunkType = 'factual';
      } else {
        // Mixed file: classify each chunk
        chunkType = await classifyChunk(chunkText);
      }

      // Process based on chunk type
      if (chunkType === 'strategic') {
        // Strategic: Artisan Cut compression + embedding
        const compressed = await compressChunk(chunkText, filename, i);

        chunksToInsert.push({
          file_id: fileId,
          chunk_index: i,
          chunk_type: 'strategic',
          chunk_essence: compressed.chunk_essence,
          decision_arc_summary: compressed.decision_arc_summary,
          salience_score: compressed.salience_score,
          raw_content: null,
          embedding: compressed.embedding
        });

      } else {
        // Factual: Raw content + embedding
        // Validate length before embedding (Voyage AI max: 32K tokens ≈ 24K chars)
        const textToEmbed = chunkText.length > 20000 ? chunkText.slice(0, 20000) : chunkText;
        const embedding = await generateEmbedding(textToEmbed);

        chunksToInsert.push({
          file_id: fileId,
          chunk_index: i,
          chunk_type: 'factual',
          chunk_essence: null,
          decision_arc_summary: null,
          salience_score: null,
          raw_content: chunkText,
          embedding
        });
      }

      // Update progress
      const currentProgress = 25 + ((i + 1) * progressPerChunk);
      await updateProgress(
        'processing_chunks',
        Math.round(currentProgress),
        {
          total_chunks: totalChunks,
          processed_chunks: i + 1
        }
      );
    }

    // Insert all chunks in single transaction (all-or-nothing)
    const { error: insertError } = await supabase.from('file_chunks').insert(chunksToInsert);

    if (insertError) {
      throw new FileProcessingError(
        `Failed to insert chunks: ${insertError.message}`
      );
    }

    // STAGE 5: Completion (95-100%)
    await updateProgress('finalizing', 98);

    // Mark file as ready
    await supabase
      .from('files')
      .update({
        status: 'ready',
        processing_stage: null,
        progress: 100,
        processed_chunks: totalChunks
      })
      .eq('id', fileId);

    await updateProgress('complete', 100, { total_chunks: totalChunks, processed_chunks: totalChunks });

    console.log(`[FileProcessor] Successfully processed file ${fileId}: ${totalChunks} chunks`);

  } catch (error) {
    console.error(`[FileProcessor] Error processing file ${fileId}:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    await markFailed(errorMessage);

    throw new FileProcessingError(`File processing failed: ${errorMessage}`);
  }
}
```

**State Machine**:

```
processing → extracting → extraction_complete → classifying →
classification_complete → chunking → chunking_complete →
processing_chunks → finalizing → complete (status: ready)

                    ↓ (on any error)
                  failed
```

**Progress Calculation**:
- Extraction: Fixed 10% (0 → 10)
- Classification: Fixed 5% (10 → 15)
- Chunking: Fixed 10% (15 → 25)
- Chunk Processing: Variable 70% (25 → 95) divided equally per chunk
- Finalization: Fixed 5% (95 → 100)

**Database Updates**:

1. **Start of processing**:
   - `processing_stage` = stage name
   - `progress` = percentage

2. **After classification**:
   - `file_type` = 'strategic' | 'factual' | 'mixed'

3. **After chunking**:
   - `total_chunks` = number of chunks

4. **Per chunk processed**:
   - `processed_chunks` += 1
   - Insert into `file_chunks` table

5. **On completion**:
   - `status` = 'ready'
   - `processing_stage` = null
   - `progress` = 100

6. **On error**:
   - `status` = 'failed'
   - `error_message` = error description
   - `processing_stage` = null
   - `progress` = 0

**Error Handling Strategy**:

1. **Extraction errors** (FileExtractionError):
   - Mark file as failed
   - Error message: "Text extraction failed: {reason}"

2. **Classification errors** (FileClassificationError):
   - Mark file as failed
   - Error message: "Classification failed: {reason}"

3. **Chunking errors** (FileChunkingError):
   - Mark file as failed
   - Error message: "Chunking failed: {reason}"

4. **Compression errors** (FileCompressionError):
   - Mark file as failed
   - Error message: "Compression failed on chunk {index}: {reason}"

5. **Invalid boundary errors**:
   - Mark file as failed
   - Error message: "Invalid chunk boundary at index {index}: {details}"
   - Rationale: Malformed boundaries indicate bad chunking; partial file data is dangerous

6. **Database errors**:
   - Mark file as failed
   - Error message: "Database operation failed: {reason}"
   - All-or-nothing: Chunk insert transaction ensures complete file or no file

7. **Network errors** (Fireworks/Voyage API):
   - Mark file as failed
   - Error message: "API call failed: {reason}"

**Concurrency Handling**:

- Each file has unique `fileId` → no locking needed
- Chunks isolated by `file_id` → no conflicts
- Progress updates use `WHERE id = fileId` → safe
- No shared state between concurrent file uploads

**All-or-Nothing Design**:

Files are consequential. Partial data is misleading and dangerous.

- **Collect-then-insert**: All chunks processed in memory, then inserted as single transaction
- **Invalid boundaries fail**: Malformed boundary → entire file fails (no skipping bad chunks)
- **Transaction guarantees**: Either all chunks succeed or none exist in database
- **No partial success**: User sees complete file (status: ready) or failure (status: failed)
- **Clear failure messages**: Specific error indicates what failed and why

**Recovery Strategy**:

If processing fails:
1. File marked as `status: failed` with specific error message
2. NO chunks in database (transaction rolled back if chunk insert fails)
3. User deletes failed file and re-uploads with fixes
4. No ambiguity: status='ready' means complete file, status='failed' means no data

No automatic retry - user must understand and fix the issue.

**Used By**:
- Upload API (Layer 5A) - called in background after file upload

**Testing Strategy**:

1. **Test script** (`test-file-processor.js`):

```javascript
import { processFile } from './src/lib/file-processor.ts';
import { readFile } from 'fs/promises';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.PUBLIC_SUPABASE_ANON_KEY
);

// Test strategic file processing
async function testStrategicFile() {
  const buffer = await readFile('test-files/strategic-journal.md');
  const filename = 'strategic-journal.md';

  // Create file record
  const { data: file } = await supabase
    .from('files')
    .insert({
      filename,
      content_hash: 'test-hash-strategic',
      status: 'processing'
    })
    .select()
    .single();

  // Process with progress callback
  const progressUpdates = [];

  await processFile(
    file.id,
    buffer,
    filename,
    (progress) => {
      progressUpdates.push(progress);
      console.log(`Progress: ${progress.stage} - ${progress.progress}%`);
    }
  );

  // Verify final state
  const { data: finalFile } = await supabase
    .from('files')
    .select('*')
    .eq('id', file.id)
    .single();

  console.assert(finalFile.status === 'ready', 'File should be ready');
  console.assert(finalFile.file_type === 'strategic', 'Should be strategic');
  console.assert(finalFile.progress === 100, 'Should be 100%');
  console.assert(finalFile.total_chunks > 0, 'Should have chunks');

  // Verify chunks in database
  const { data: chunks } = await supabase
    .from('file_chunks')
    .select('*')
    .eq('file_id', file.id);

  console.assert(chunks.length === finalFile.total_chunks, 'Chunk count matches');
  console.assert(chunks.every(c => c.chunk_type === 'strategic'), 'All strategic');
  console.assert(chunks.every(c => c.chunk_essence !== null), 'Has essence');
  console.assert(chunks.every(c => c.embedding !== null), 'Has embedding');

  // Verify progress updates
  console.assert(progressUpdates.length > 0, 'Progress callbacks fired');
  console.assert(progressUpdates[progressUpdates.length - 1].progress === 100, 'Final progress 100%');

  console.log('✓ Strategic file test passed');
}

// Test factual file processing
async function testFactualFile() {
  const buffer = await readFile('test-files/industry-report.md');
  const filename = 'industry-report.md';

  const { data: file } = await supabase
    .from('files')
    .insert({
      filename,
      content_hash: 'test-hash-factual',
      status: 'processing'
    })
    .select()
    .single();

  await processFile(file.id, buffer, filename);

  const { data: finalFile } = await supabase
    .from('files')
    .select('*')
    .eq('id', file.id)
    .single();

  console.assert(finalFile.status === 'ready');
  console.assert(finalFile.file_type === 'factual');

  const { data: chunks } = await supabase
    .from('file_chunks')
    .select('*')
    .eq('file_id', file.id);

  console.assert(chunks.every(c => c.chunk_type === 'factual'), 'All factual');
  console.assert(chunks.every(c => c.raw_content !== null), 'Has raw content');

  console.log('✓ Factual file test passed');
}

// Test error handling
async function testErrorHandling() {
  const { data: file } = await supabase
    .from('files')
    .insert({
      filename: 'empty.txt',
      content_hash: 'test-hash-empty',
      status: 'processing'
    })
    .select()
    .single();

  try {
    await processFile(file.id, Buffer.from(''), 'empty.txt');
    console.error('Should have thrown error!');
  } catch (error) {
    console.log('✓ Error thrown as expected');
  }

  // Verify file marked as failed
  const { data: failedFile } = await supabase
    .from('files')
    .select('*')
    .eq('id', file.id)
    .single();

  console.assert(failedFile.status === 'failed', 'File marked as failed');
  console.assert(failedFile.error_message !== null, 'Has error message');

  console.log('✓ Error handling test passed');
}

// Run all tests
await testStrategicFile();
await testFactualFile();
await testErrorHandling();

console.log('All file processor tests passed!');
```

2. **Manual verification**:
   - Upload strategic file → check database shows progressive updates
   - Upload factual file → check chunks have raw_content
   - Upload mixed file → check some chunks strategic, some factual
   - Upload invalid file → check marked as failed with error message

**Definition of Done**:
- ✅ processFile() orchestrates all layers correctly
- ✅ Progress updates happen at each stage
- ✅ Database state transitions: processing → ready
- ✅ Strategic files: chunks have chunk_essence + decision_arc
- ✅ Factual files: chunks have raw_content
- ✅ Mixed files: chunks correctly classified and routed
- ✅ Error handling marks file as failed with clear message
- ✅ Progress percentage accurately reflects completion (0-100)
- ✅ All chunks saved to database with correct embeddings
- ✅ Test script passes for all file types

### Layer 5: API Endpoints (Orchestration + Database)

**5A. Upload API** - `src/routes/api/files/upload/+server.ts`

**Purpose**: Accept file uploads, validate, create database record, trigger background processing

**Dependencies**:
- Layer 2A: `validateFileSize`, `generateContentHash` from file-extraction.ts
- Layer 4: `processFile` from file-processor.ts
- Supabase client for database operations
- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` environment variables

**Exact API Specification**:

```typescript
// POST /api/files/upload
// Content-Type: multipart/form-data

// Request body:
{
  file: File  // Single file from FormData
}

// Response (201 Created):
{
  fileId: string,
  filename: string,
  status: 'processing'
}

// Error responses:
// 400 Bad Request - No file provided
// 400 Bad Request - File too large (>10MB)
// 500 Internal Server Error - Processing failed
```

**Implementation Details**:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateFileSize, generateContentHash } from '$lib/file-extraction';
import { processFile } from '$lib/file-processor';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

export const POST: RequestHandler = async ({ request }) => {
  try {
    // Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file size (10MB limit)
    try {
      validateFileSize(buffer, 10);
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'File too large' },
        { status: 400 }
      );
    }

    // Generate content hash for deduplication
    const contentHash = generateContentHash(buffer);

    // Check for duplicate file
    const { data: existingFile } = await supabase
      .from('files')
      .select('id, filename, status')
      .eq('content_hash', contentHash)
      .single();

    if (existingFile) {
      // File already uploaded
      return json(
        {
          fileId: existingFile.id,
          filename: existingFile.filename,
          status: existingFile.status,
          isDuplicate: true
        },
        { status: 200 }
      );
    }

    // Create file record in database
    const { data: fileRecord, error: insertError } = await supabase
      .from('files')
      .insert({
        filename: file.name,
        content_hash: contentHash,
        status: 'processing',
        progress: 0
      })
      .select()
      .single();

    if (insertError || !fileRecord) {
      console.error('[UploadAPI] Database insert failed:', insertError);
      return json({ error: 'Failed to create file record' }, { status: 500 });
    }

    // Start background processing (fire and forget)
    processFile(fileRecord.id, buffer, file.name).catch((error) => {
      console.error(`[UploadAPI] Background processing failed for ${fileRecord.id}:`, error);
      // Error already handled by processFile (marks file as failed)
    });

    // Return immediately
    return json(
      {
        fileId: fileRecord.id,
        filename: fileRecord.filename,
        status: 'processing'
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[UploadAPI] Upload failed:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
};
```

**Key Design Decisions**:

1. **Fire-and-forget processing**:
   - API returns immediately after creating database record
   - processFile() runs in background
   - Frontend polls for progress updates

2. **Deduplication**:
   - Check content_hash before creating new record
   - Return existing file if duplicate found
   - Prevents re-processing same file

3. **Error handling**:
   - Validation errors return 400
   - Database/processing errors return 500
   - processFile() handles its own errors (marks file as failed)

4. **No authentication** (MVP):
   - Files are public/shared across users
   - Add auth layer later if needed

**Used By**:
- Frontend file upload UI (Layer 7A)

**Testing Strategy**:

```javascript
// test-upload-api.js
import { readFile } from 'fs/promises';

async function testUpload() {
  const buffer = await readFile('test-files/strategic-journal.md');
  const formData = new FormData();
  formData.append('file', new Blob([buffer]), 'strategic-journal.md');

  const response = await fetch('http://localhost:5173/api/files/upload', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();

  console.assert(response.status === 201, 'Should return 201 Created');
  console.assert(result.fileId, 'Should return fileId');
  console.assert(result.filename === 'strategic-journal.md', 'Filename matches');
  console.assert(result.status === 'processing', 'Status is processing');

  console.log('✓ Upload test passed');
  return result.fileId;
}

async function testDuplicateUpload() {
  const buffer = await readFile('test-files/strategic-journal.md');
  const formData = new FormData();
  formData.append('file', new Blob([buffer]), 'strategic-journal.md');

  // Upload twice
  await fetch('http://localhost:5173/api/files/upload', {
    method: 'POST',
    body: formData
  });

  const response2 = await fetch('http://localhost:5173/api/files/upload', {
    method: 'POST',
    body: formData
  });

  const result = await response2.json();

  console.assert(response2.status === 200, 'Should return 200 OK');
  console.assert(result.isDuplicate === true, 'Should mark as duplicate');

  console.log('✓ Duplicate upload test passed');
}

async function testFileTooLarge() {
  const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
  const formData = new FormData();
  formData.append('file', new Blob([largeBuffer]), 'large.pdf');

  const response = await fetch('http://localhost:5173/api/files/upload', {
    method: 'POST',
    body: formData
  });

  console.assert(response.status === 400, 'Should return 400 Bad Request');

  const result = await response.json();
  console.assert(result.error.includes('too large'), 'Error mentions size');

  console.log('✓ File too large test passed');
}

await testUpload();
await testDuplicateUpload();
await testFileTooLarge();
console.log('All upload API tests passed!');
```

**Definition of Done**:
- ✅ POST /api/files/upload accepts FormData with file
- ✅ File size validated (10MB limit)
- ✅ Content hash generated for deduplication
- ✅ Duplicate files return existing record
- ✅ Database record created with status='processing'
- ✅ processFile() triggered in background
- ✅ Returns 201 with fileId, filename, status
- ✅ Error responses return appropriate status codes
- ✅ Test script passes all cases

---

**5B. List API** - `src/routes/api/files/+server.ts`

**Purpose**: Return list of uploaded files with processing status for frontend display

**Dependencies**:
- Supabase client for database queries
- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` environment variables

**Exact API Specification**:

```typescript
// GET /api/files
// Optional query params: ?status=ready|processing|failed

// Response (200 OK):
{
  files: [
    {
      id: string,
      filename: string,
      status: 'processing' | 'ready' | 'failed',
      file_type: 'strategic' | 'factual' | 'mixed' | null,
      progress: number,  // 0-100
      processing_stage: string | null,
      total_chunks: number | null,
      processed_chunks: number | null,
      error_message: string | null,
      uploaded_at: string  // ISO 8601 timestamp
    }
  ]
}

// Error responses:
// 500 Internal Server Error - Database query failed
```

**Implementation Details**:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const GET: RequestHandler = async ({ url }) => {
  try {
    const status = url.searchParams.get('status');

    let query = supabase
      .from('files')
      .select('*')
      .order('uploaded_at', { ascending: false });

    // Optional status filter
    if (status && ['ready', 'processing', 'failed'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data: files, error } = await query;

    if (error) {
      console.error('[ListAPI] Database query failed:', error);
      return json({ error: 'Failed to fetch files' }, { status: 500 });
    }

    return json({ files: files || [] }, { status: 200 });
  } catch (error) {
    console.error('[ListAPI] Request failed:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: 500 }
    );
  }
};
```

**Query Patterns**:

1. **All files** (default): `GET /api/files`
2. **Ready files only**: `GET /api/files?status=ready`
3. **Processing files**: `GET /api/files?status=processing`
4. **Failed files**: `GET /api/files?status=failed`

**Sorting**: Most recent first (`uploaded_at DESC`)

**Used By**:
- Frontend files store (Layer 6) - polling for updates
- File management dropdown (Layer 7B)

**Testing Strategy**:

```javascript
// test-list-api.js

async function testListFiles() {
  const response = await fetch('http://localhost:5173/api/files');
  const result = await response.json();

  console.assert(response.status === 200, 'Should return 200 OK');
  console.assert(Array.isArray(result.files), 'Should return array');
  console.assert(result.files.length >= 0, 'Array can be empty');

  console.log('✓ List files test passed');
}

async function testFilterByStatus() {
  const response = await fetch('http://localhost:5173/api/files?status=ready');
  const result = await response.json();

  console.assert(response.status === 200, 'Should return 200 OK');
  console.assert(result.files.every(f => f.status === 'ready'), 'All files are ready');

  console.log('✓ Filter by status test passed');
}

async function testSorting() {
  const response = await fetch('http://localhost:5173/api/files');
  const result = await response.json();

  if (result.files.length > 1) {
    const dates = result.files.map(f => new Date(f.uploaded_at));
    for (let i = 0; i < dates.length - 1; i++) {
      console.assert(dates[i] >= dates[i + 1], 'Files sorted by uploaded_at DESC');
    }
  }

  console.log('✓ Sorting test passed');
}

await testListFiles();
await testFilterByStatus();
await testSorting();
console.log('All list API tests passed!');
```

**Definition of Done**:
- ✅ GET /api/files returns array of file records
- ✅ Optional ?status filter works correctly
- ✅ Files sorted by uploaded_at (most recent first)
- ✅ Returns all relevant fields for UI display
- ✅ Empty array returned when no files
- ✅ Error responses return 500 with message
- ✅ Test script passes all cases

---

**5C. Delete API** - `src/routes/api/files/[id]/+server.ts`

**Purpose**: Delete file and all associated chunks (CASCADE)

**Dependencies**:
- Supabase client for database operations
- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` environment variables

**Exact API Specification**:

```typescript
// DELETE /api/files/[id]

// Response (200 OK):
{
  success: true,
  fileId: string
}

// Error responses:
// 404 Not Found - File does not exist
// 500 Internal Server Error - Deletion failed
```

**Implementation Details**:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const DELETE: RequestHandler = async ({ params }) => {
  const { id } = params;

  if (!id) {
    return json({ error: 'File ID required' }, { status: 400 });
  }

  try {
    // Check if file exists
    const { data: existingFile, error: fetchError } = await supabase
      .from('files')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existingFile) {
      return json({ error: 'File not found' }, { status: 404 });
    }

    // Delete file (CASCADE will delete file_chunks automatically)
    const { error: deleteError } = await supabase
      .from('files')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[DeleteAPI] Deletion failed:', deleteError);
      return json({ error: 'Deletion failed' }, { status: 500 });
    }

    return json({ success: true, fileId: id }, { status: 200 });
  } catch (error) {
    console.error('[DeleteAPI] Request failed:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: 500 }
    );
  }
};
```

**Key Behavior**:

1. **CASCADE deletion**:
   - Deleting file automatically deletes all file_chunks (via foreign key)
   - No need to manually delete chunks

2. **404 handling**:
   - Check file exists before attempting delete
   - Return 404 if file not found

3. **Idempotency**:
   - Deleting non-existent file returns 404 (not 200)
   - Frontend should handle 404 gracefully

**Used By**:
- Frontend files store (Layer 6) - deleteFile() action
- File management dropdown (Layer 7B) - delete button

**Testing Strategy**:

```javascript
// test-delete-api.js

async function testDeleteFile() {
  // First upload a file
  const uploadFormData = new FormData();
  const buffer = Buffer.from('test content');
  uploadFormData.append('file', new Blob([buffer]), 'test-delete.txt');

  const uploadResponse = await fetch('http://localhost:5173/api/files/upload', {
    method: 'POST',
    body: uploadFormData
  });

  const { fileId } = await uploadResponse.json();

  // Now delete it
  const deleteResponse = await fetch(`http://localhost:5173/api/files/${fileId}`, {
    method: 'DELETE'
  });

  const result = await deleteResponse.json();

  console.assert(deleteResponse.status === 200, 'Should return 200 OK');
  console.assert(result.success === true, 'Should return success: true');
  console.assert(result.fileId === fileId, 'Should return fileId');

  // Verify file is gone
  const listResponse = await fetch('http://localhost:5173/api/files');
  const { files } = await listResponse.json();
  console.assert(!files.find(f => f.id === fileId), 'File should be deleted');

  console.log('✓ Delete file test passed');
}

async function testDeleteNonExistent() {
  const fakeId = '00000000-0000-0000-0000-000000000000';

  const response = await fetch(`http://localhost:5173/api/files/${fakeId}`, {
    method: 'DELETE'
  });

  console.assert(response.status === 404, 'Should return 404 Not Found');

  console.log('✓ Delete non-existent test passed');
}

async function testCascadeDeletion() {
  // Upload and process a file
  const uploadFormData = new FormData();
  const buffer = await readFile('test-files/strategic-journal.md');
  uploadFormData.append('file', new Blob([buffer]), 'cascade-test.md');

  const uploadResponse = await fetch('http://localhost:5173/api/files/upload', {
    method: 'POST',
    body: uploadFormData
  });

  const { fileId } = await uploadResponse.json();

  // Wait for processing to complete (add chunks to database)
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Verify chunks exist
  const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL,
    process.env.PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: chunksBefore } = await supabase
    .from('file_chunks')
    .select('id')
    .eq('file_id', fileId);

  console.assert(chunksBefore && chunksBefore.length > 0, 'Chunks should exist');

  // Delete file
  await fetch(`http://localhost:5173/api/files/${fileId}`, {
    method: 'DELETE'
  });

  // Verify chunks are also deleted
  const { data: chunksAfter } = await supabase
    .from('file_chunks')
    .select('id')
    .eq('file_id', fileId);

  console.assert(!chunksAfter || chunksAfter.length === 0, 'Chunks should be CASCADE deleted');

  console.log('✓ CASCADE deletion test passed');
}

await testDeleteFile();
await testDeleteNonExistent();
await testCascadeDeletion();
console.log('All delete API tests passed!');
```

**Definition of Done**:
- ✅ DELETE /api/files/[id] deletes file record
- ✅ CASCADE deletion removes all file_chunks
- ✅ Returns 200 with success: true
- ✅ Returns 404 if file not found
- ✅ Returns 500 on database errors
- ✅ Test script passes all cases including CASCADE verification

### Layer 6: Frontend State (API Endpoints)

**6. Files Store** - `src/lib/stores/files.ts`

**Purpose**: Centralized Svelte store for managing file upload state, providing reactive data to UI components, and orchestrating API calls with real-time SSE updates.

**Dependencies**:
- Layer 5A: Upload API (`POST /api/files/upload`)
- Layer 5B: List API (`GET /api/files`)
- Layer 5C: Delete API (`DELETE /api/files/[id]`)

**Exact API Specification**:

```typescript
// File type matching database schema
export interface FileRecord {
  id: string;
  filename: string;
  status: 'processing' | 'ready' | 'failed';
  file_type: 'strategic' | 'factual' | 'mixed' | null;
  progress: number; // 0-100
  processing_stage: string | null;
  total_chunks: number | null;
  processed_chunks: number | null;
  error_message: string | null;
  uploaded_at: string; // ISO 8601 timestamp
}

// Writable store
export const files: Writable<FileRecord[]>;

// Derived stores
export const processingFiles: Readable<FileRecord[]>;
export const readyFiles: Readable<FileRecord[]>;
export const failedFiles: Readable<FileRecord[]>;

// Actions
export async function uploadFile(file: File): Promise<{ success: boolean; fileId?: string; error?: string }>;
export async function deleteFile(fileId: string): Promise<{ success: boolean; error?: string }>;
export async function refreshFiles(): Promise<void>;
```

**Implementation Details**:

```typescript
import { writable, derived, get } from 'svelte/store';

export interface FileRecord {
  id: string;
  filename: string;
  status: 'processing' | 'ready' | 'failed';
  file_type: 'strategic' | 'factual' | 'mixed' | null;
  progress: number;
  processing_stage: string | null;
  total_chunks: number | null;
  processed_chunks: number | null;
  error_message: string | null;
  uploaded_at: string;
}

// Main store
export const files = writable<FileRecord[]>([]);

// Derived stores
export const processingFiles = derived(
  files,
  ($files) => $files.filter((f) => f.status === 'processing')
);

export const readyFiles = derived(
  files,
  ($files) => $files.filter((f) => f.status === 'ready')
);

export const failedFiles = derived(
  files,
  ($files) => $files.filter((f) => f.status === 'failed')
);

// Polling state
let pollingInterval: ReturnType<typeof setInterval> | null = null;

// Upload file action
export async function uploadFile(file: File): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/files/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: errorData.error || 'Upload failed' };
    }

    const data = await response.json();

    // Refresh file list to show new file
    await refreshFiles();

    // Start polling if not already running
    startPolling();

    return { success: true, fileId: data.fileId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    };
  }
}

// Delete file action
export async function deleteFile(fileId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/files/${fileId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: errorData.error || 'Delete failed' };
    }

    // Remove from local store immediately
    files.update((current) => current.filter((f) => f.id !== fileId));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed'
    };
  }
}

// Refresh files from API
export async function refreshFiles(): Promise<void> {
  try {
    const response = await fetch('/api/files');

    if (!response.ok) {
      console.error('[FilesStore] Failed to refresh files');
      return;
    }

    const data = await response.json();
    files.set(data.files || []);
  } catch (error) {
    console.error('[FilesStore] Error refreshing files:', error);
  }
}

// Start polling for updates
function startPolling() {
  // Don't start if already polling
  if (pollingInterval) return;

  pollingInterval = setInterval(async () => {
    const $processingFiles = get(processingFiles);

    // Stop polling if no files are processing
    if ($processingFiles.length === 0) {
      stopPolling();
      return;
    }

    // Refresh files to get updated progress
    await refreshFiles();
  }, 2000); // Poll every 2 seconds
}

// Stop polling
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// Initialize: Load files on module import
refreshFiles();
```

**Key Design Decisions**:

1. **Automatic Polling**:
   - Starts when a file is uploaded
   - Polls every 2 seconds while processing files exist
   - Automatically stops when no files are processing
   - Prevents unnecessary API calls when idle

2. **Optimistic Updates**:
   - Delete operation removes file from store immediately
   - If API fails, user sees the error but file is already gone (acceptable tradeoff)

3. **Error Handling**:
   - All actions return `{ success, error }` object
   - UI components can display errors to user
   - Failed API calls logged to console but don't crash the app

4. **Derived Stores**:
   - `processingFiles` - for showing active uploads badge
   - `readyFiles` - for filtering file list
   - `failedFiles` - for error display
   - Automatically update when main `files` store changes

5. **Module-Level Initialization**:
   - `refreshFiles()` called on module import
   - Ensures files are loaded when user first visits the page
   - No manual initialization needed

**Used By**:
- Layer 7A: Upload UI (paperclip button)
- Layer 7B: Files dropdown (file list, progress bars, delete buttons)

**Testing Strategy**:

```javascript
// test-files-store.js
import { files, processingFiles, readyFiles, uploadFile, deleteFile, refreshFiles } from './src/lib/stores/files.ts';
import { get } from 'svelte/store';

async function testStore() {
  // Test 1: Initial load
  await refreshFiles();
  console.assert(Array.isArray(get(files)), 'Files should be an array');
  console.log('✓ Initial load works');

  // Test 2: Upload file
  const testFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
  const uploadResult = await uploadFile(testFile);
  console.assert(uploadResult.success === true, 'Upload should succeed');
  console.assert(uploadResult.fileId, 'Should return fileId');
  console.log('✓ Upload works');

  // Wait a bit for processing to start
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 3: Verify file appears in store
  const currentFiles = get(files);
  const uploadedFile = currentFiles.find(f => f.id === uploadResult.fileId);
  console.assert(uploadedFile, 'Uploaded file should appear in store');
  console.assert(uploadedFile.status === 'processing', 'Status should be processing');
  console.log('✓ File appears in store');

  // Test 4: Derived stores
  const $processingFiles = get(processingFiles);
  console.assert($processingFiles.length > 0, 'Should have processing files');
  console.assert($processingFiles.some(f => f.id === uploadResult.fileId), 'Uploaded file should be in processingFiles');
  console.log('✓ Derived stores work');

  // Test 5: Delete file
  const deleteResult = await deleteFile(uploadResult.fileId);
  console.assert(deleteResult.success === true, 'Delete should succeed');

  const filesAfterDelete = get(files);
  console.assert(!filesAfterDelete.some(f => f.id === uploadResult.fileId), 'File should be removed from store');
  console.log('✓ Delete works');

  console.log('All files store tests passed!');
}

testStore().catch(console.error);
```

**Manual Testing**:
1. Open browser console and run: `window.filesStore = await import('./src/lib/stores/files.ts')`
2. Check initial files: `console.log($filesStore.files)`
3. Upload a file via UI and watch store updates in real-time
4. Verify polling behavior: Processing files should auto-update every 2 seconds
5. Verify polling stops when all files are ready/failed

**Definition of Done**:
- ✅ Store exports `files`, `processingFiles`, `readyFiles`, `failedFiles`
- ✅ `uploadFile()` calls Upload API and returns success/error
- ✅ `deleteFile()` calls Delete API and updates store
- ✅ `refreshFiles()` calls List API and updates store
- ✅ Automatic polling starts after upload
- ✅ Polling stops when no processing files exist
- ✅ Derived stores automatically update when main store changes
- ✅ Test script passes all assertions
- ✅ Manual testing confirms real-time updates

---

### Layer 6.5: Server-Sent Events + Store Wiring

**Purpose**: Replace polling with SSE for real-time file progress updates, eliminating wasteful API calls

**Why SSE over polling:**
- Polling = 30 GET /api/files per minute per user = 1,800 calls/hour
- SSE = 1 persistent connection, updates pushed only on changes = ~0 polling calls
- Cost savings scale with users and file processing time

**Architecture decisions:**
1. **Initial load:** GET /api/files on mount, then connect SSE (hybrid approach)
2. **SSE lifecycle:** Connect only when files are processing, disconnect when done
3. **Connection failure:** No auto-reconnect. Show "Connection lost. Re-upload the file." per affected file
4. **User action required:** Re-upload the file to recover
5. **Multi-user filtering:** SSE returns ALL files (no user_id filter) until authentication is implemented. TODO: Add user_id filtering when auth is ready.

**Components:**

---

**6.5A. SSE API Endpoint** - `src/routes/api/files/events/+server.ts`

**Purpose:** Push real-time file updates via Supabase Realtime

**API Specification:**
```typescript
GET /api/files/events
Response: text/event-stream

// Event types:
// 1. Connection established
data: {"type":"connected","timestamp":"2025-01-15T10:30:00.000Z"}

// 2. File update (INSERT or UPDATE)
data: {"type":"file-update","file":{...FileRecord}}

// 3. File deleted
data: {"type":"file-deleted","fileId":"uuid"}

// 4. Heartbeat (every 30s to keep connection alive)
data: {"type":"heartbeat","timestamp":"2025-01-15T10:30:30.000Z"}
```

**Implementation:**
```typescript
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(data: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      // Send connection confirmation
      send({ type: 'connected', timestamp: new Date().toISOString() });

      // Subscribe to database changes
      const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // TODO: Add user_id filtering when authentication is implemented
      // Currently returns ALL files (no filtering) for development
      const channel = supabase
        .channel('file-changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'files'
        }, async (payload) => {
          if (payload.eventType === 'DELETE') {
            send({ type: 'file-deleted', fileId: payload.old.id });
          } else {
            // Fetch full updated record
            const { data: file } = await supabase
              .from('files')
              .select('*')
              .eq('id', payload.new.id)
              .single();

            if (file) {
              send({ type: 'file-update', file });
            }
          }
        })
        .subscribe();

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        send({ type: 'heartbeat', timestamp: new Date().toISOString() });
      }, 30000);

      // Cleanup on disconnect
      return () => {
        clearInterval(heartbeat);
        channel.unsubscribe();
      };
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
```

**Testing:**
```bash
# Manual test
curl http://localhost:5173/api/files/events

# Should see:
# data: {"type":"connected","timestamp":"..."}
#
# (then heartbeats every 30s)
```

---

**6.5B. Store SSE Integration** - `src/lib/stores/files.ts`

**Add SSE connection management to existing store:**

```typescript
// Add to top of file
let eventSource: EventSource | null = null;
let sseConnectionLost = writable<boolean>(false);

export { sseConnectionLost }; // Export for UI to check

// Add SSE functions
export function connectSSE() {
  if (eventSource) return; // Already connected

  eventSource = new EventSource('/api/files/events');

  eventSource.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'connected':
        console.log('[SSE] Connected');
        sseConnectionLost.set(false);
        break;

      case 'file-update':
        files.update((current) => {
          const index = current.findIndex((f) => f.id === data.file.id);
          if (index >= 0) {
            current[index] = data.file;
          } else {
            current.push(data.file);
          }
          return [...current];
        });
        break;

      case 'file-deleted':
        files.update((current) => current.filter((f) => f.id !== data.fileId));
        break;

      case 'heartbeat':
        // Keep-alive, do nothing
        break;
    }
  });

  eventSource.addEventListener('error', () => {
    console.error('[SSE] Connection lost');
    sseConnectionLost.set(true);
    disconnectSSE();
    // No auto-reconnect: user must re-upload file
  });
}

export function disconnectSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    console.log('[SSE] Disconnected');
  }
}

// Update uploadFile to connect SSE after upload
export async function uploadFile(file: File): Promise<{...}> {
  // ... existing upload logic ...

  if (result.success) {
    await refreshFiles();

    // Connect SSE for real-time updates
    connectSSE();

    return { success: true, fileId: data.fileId };
  }
  // ...
}

// REMOVE polling code (lines 107-132):
// - startPolling()
// - stopPolling()
// - pollingInterval

// REMOVE auto-init from bottom:
// refreshFiles(); // DELETE THIS LINE
```

**Key changes:**
- Replace polling with SSE connection
- SSE connects after successful upload
- SSE disconnects when connection lost (no auto-reconnect)
- `sseConnectionLost` store tracks connection state for UI

---

**6.5C. Page Initialization** - `src/routes/+page.svelte`

**Add to script section:**
```typescript
import { files, uploadFile, deleteFile, refreshFiles, processingFiles, connectSSE, disconnectSSE } from '$lib/stores/files';

// Initialize files on page mount
$effect(() => {
  refreshFiles(); // Load initial state via GET /api/files

  // If any files are processing, connect SSE
  if ($processingFiles.length > 0) {
    connectSSE();
  }
});

// Watch for all files completing, disconnect SSE
$effect(() => {
  if ($processingFiles.length === 0) {
    disconnectSSE();
  }
});
```

**Rationale:**
- GET /api/files gives immediate initial state
- SSE connects only if needed (files processing)
- SSE disconnects when no longer needed (all files done)
- Clean lifecycle management

---

**Dependencies**:
- Supabase Realtime enabled (already configured)
- Layer 6: Files Store (complete)
- Layer 5: API endpoints (complete)

**Used By**:
- Layer 7: UI Components (displays error on connection loss)

**Testing Strategy**:
```bash
# 1. Normal flow
- Upload file → Check network: 1 SSE connection opens
- Wait for progress → Should see file-update events in SSE stream
- File completes → SSE disconnects
- No polling requests in network tab

# 2. Connection loss
- Upload file → SSE connects
- Kill WiFi mid-processing
- Check UI: Files show "Connection lost. Re-upload the file."
- User must re-upload file to recover

# 3. Multiple files
- Upload 3 files → 1 SSE connection (not 3)
- All files update via same stream
- Last file completes → SSE disconnects
```

**Definition of Done**:
- ✅ SSE endpoint implemented at /api/files/events
- ✅ Supabase Realtime subscription working
- ✅ file-update and file-deleted events sent
- ✅ Store connectSSE() and disconnectSSE() functions added
- ✅ sseConnectionLost store exported
- ✅ Polling code removed from files.ts
- ✅ uploadFile() triggers connectSSE()
- ✅ Page $effect loads files on mount
- ✅ SSE disconnects when no processing files
- ✅ No auto-reconnect on error
- ✅ refreshFiles() auto-init removed from store

---

### Layer 7: UI Component Integration (Upload & File Management)

**Purpose**: Wire UI components to real files store, implement upload flow

**Dependencies**:
- Layer 6.5: Store lifecycle management (required)
- Existing UI mockup (complete)

**Components:**

**7A. Wire File Dropdown to Real Store** - `src/routes/+page.svelte`

**Changes needed:**

1. **Remove mock data:**
```typescript
// DELETE this entire state declaration:
let mockFiles = $state([
  { id: '1', filename: 'quarterly_financial_report_Q4.pdf', progress: 100, status: 'ready' },
  // ... all mock data
]);
```

2. **Update dropdown to use real store:**
```svelte
<!-- Line ~264: Change from mockFiles to $files -->
{#each $files as file}
  <div class="file-row">
    <!-- existing row template -->
  </div>
{/each}
```

3. **Handle file errors, SSE connection loss, and processing stages:**
```svelte
{#if file.status === 'failed'}
  <span class="file-error">{file.error_message || 'Upload failed. Try again.'}</span>
{:else if file.status === 'processing' && $sseConnectionLost}
  <span class="file-error">Connection lost. Re-upload the file.</span>
{:else if file.status === 'processing' && file.progress === 0}
  <!-- Show processing stage before progress starts -->
  <span class="file-stage">{file.processing_stage || 'Validating...'}</span>
{:else}
  <!-- Progress bars for active processing -->
  <div class="file-progress-bar">
    <div class="file-progress-fill" style="width: {file.progress}%; background: {getProgressBarColor(file.progress)}"></div>
  </div>
  <span class="file-percentage">{file.progress}%</span>
{/if}
```

**Import sseConnectionLost at top:**
```typescript
import { files, uploadFile, deleteFile, refreshFiles, processingFiles, connectSSE, disconnectSSE, sseConnectionLost } from '$lib/stores/files';
```

4. **Wire delete button with confirmation dialog:**
```svelte
<!-- Add onclick handler to trash button -->
<button class="file-delete-btn" title="Delete file" onclick={() => startFileDelete(file.id)}>
  <Icon src={LuTrash2} size="11" />
</button>
```

**Add to script section:**
```typescript
// File delete confirmation state (similar to nuke button)
let showDeleteConfirm = $state(false);
let deleteFileId: string | null = $state(null);
let deleteProgress = $state(0);
let deleteTimer: number | null = null;

function startFileDelete(fileId: string) {
  deleteFileId = fileId;
  showDeleteConfirm = true;
  deleteProgress = 0;

  // Auto-delete after 3 seconds if not cancelled
  let elapsed = 0;
  deleteTimer = window.setInterval(() => {
    elapsed += 50;
    deleteProgress = (elapsed / 3000) * 100;

    if (deleteProgress >= 100) {
      confirmFileDelete();
    }
  }, 50);
}

function cancelFileDelete() {
  if (deleteTimer) {
    clearInterval(deleteTimer);
    deleteTimer = null;
  }
  showDeleteConfirm = false;
  deleteFileId = null;
  deleteProgress = 0;
}

async function confirmFileDelete() {
  if (deleteTimer) {
    clearInterval(deleteTimer);
    deleteTimer = null;
  }

  if (!deleteFileId) return;

  const result = await deleteFile(deleteFileId);
  if (!result.success) {
    console.error('[FileDelete] Failed:', result.error);
  }

  showDeleteConfirm = false;
  deleteFileId = null;
  deleteProgress = 0;
}
```

**Add delete confirmation dialog (similar to nuke dialog structure):**
```svelte
{#if showDeleteConfirm}
  <div class="delete-confirm-overlay">
    <div class="delete-confirm-dialog">
      <p>If you want to abort, hit Cancel. If you want to delete, do nothing.</p>
      <div class="delete-progress-bar">
        <div class="delete-progress-fill" style="width: {deleteProgress}%"></div>
      </div>
      <button onclick={cancelFileDelete}>Cancel</button>
    </div>
  </div>
{/if}
```

---

**7B. File Upload UI** - `src/routes/+page.svelte`

**Add hidden file input (after line 307, before textarea):**
```svelte
<!-- Hidden file input -->
<input
  type="file"
  accept=".pdf,.txt,.md"
  style="display: none;"
  bind:this={fileInputRef}
  onchange={handleFileSelect}
/>
```

**Add to script section:**
```typescript
let fileInputRef: HTMLInputElement | undefined = $state();

function handlePaperclipClick() {
  fileInputRef?.click();
}

async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) return;

  const result = await uploadFile(file);

  if (result.success) {
    console.log('[Upload] Success:', result.fileId);
  } else {
    console.error('[Upload] Failed:', result.error);
  }

  // Reset input so same file can be uploaded again
  target.value = '';
}
```

**Wire paperclip button:**
```svelte
<button class="control-btn" title="Attach file" onclick={handlePaperclipClick}>
  <Icon src={LuPaperclip} size="11" />
</button>
```

**Supported file types:**
- `.pdf` - Extracted via unpdf library
- `.txt` - Plain text via Buffer.toString()
- `.md` - Markdown via Buffer.toString()

---

**7C. Error Handling**

**Implementation:**
- Upload network errors: Show error in file row with "Try again" message
- Processing errors: Show `file.error_message` in dropdown
- Delete errors: Console log only (user can retry via UI)
- SSE connection loss: Show "Connection lost. Re-upload the file."

**Error display location:** All errors appear in the file row where progress/status normally shows

---

**Testing Strategy:**

**Manual end-to-end flow:**

1. **Initial load:**
   - Open page → Check network: GET /api/files
   - Dropdown shows existing files or empty state
   - No polling if no processing files

2. **Upload flow:**
   - Click paperclip → Native file picker opens
   - Select test PDF → Upload initiates
   - File appears in dropdown showing "Validating..." (or processing_stage)
   - SSE connection opens (check network tab)
   - Progress increases: 0% → 25% → 50% → 100%
   - Bar color: amber → green
   - SSE disconnects when file reaches 100%
   - No polling requests in network tab

3. **Delete flow:**
   - Click trash icon on a file
   - Confirmation dialog appears: "If you want to abort, hit Cancel. If you want to delete, do nothing."
   - Progress bar fills over 3 seconds
   - If user waits: File deletes and disappears from dropdown
   - If user hits Cancel: Dialog closes, file remains
   - Check database: File + chunks deleted (CASCADE)

4. **Error cases:**
   - Upload corrupted PDF → File shows "failed" with error_message
   - Upload 11MB file → Should fail with size limit error
   - SSE connection loss → File shows "Connection lost. Re-upload the file."
   - Network error during upload → Console error logged

**Test files available:**
- `test-files/strategic-journal.md` - Small strategic file
- `test-files/huge.pdf` - 11MB file (tests size limit)

---

**Definition of Done:**

**Layer 7A (Dropdown):**
- ✅ mockFiles state removed
- ✅ Dropdown uses `$files` from store
- ✅ Processing stage shown at 0% progress
- ✅ SSE connection loss error displayed
- ✅ Delete button wired with confirmation dialog
- ✅ Empty state displays when no files
- ✅ Progress bars show correct colors

**Layer 7B (Upload):**
- ✅ Hidden file input added (accept: .pdf,.txt,.md)
- ✅ fileInputRef bound to input element
- ✅ handlePaperclipClick() triggers file picker
- ✅ handleFileSelect() calls uploadFile()
- ✅ Input resets after upload (value = '')
- ✅ Paperclip button onclick wired

**Layer 7C (Error Handling):**
- ✅ Upload errors logged to console
- ✅ Delete errors logged to console
- ✅ Failed files show error_message in dropdown
- ✅ SSE connection loss shows re-upload message

**Integration:**
- ✅ Can upload multiple files in parallel
- ✅ Progress updates automatically via SSE
- ✅ Can delete file with confirmation
- ✅ No polling requests in network tab
- ✅ No JavaScript errors in console during normal operation

---

## Critical Path (MVP)

**Minimum viable implementation order:**

1. ✅ Database (done)
2. Text Extraction (2A)
3. Vectorization (2B)
4. File Classifier (3A)
5. File Chunker (3B)
6. File Compressor (3D) - strategic only
7. File Processor (4) - strategic flow only
8. Upload API (5A)
9. List API (5B)
10. Delete API (5C)
11. **SSE Endpoint (6.5)** - MUST come before UI
12. Files Store (6) - update with SSE connection
13. Upload UI (7A) + File Dropdown (7B) + error handling (7C)

**Can defer:**
- Chunk Classifier (3C) - only needed for mixed files
- Mixed file support - implement after strategic flow works

**Reasoning**: Get upload → processing → storage → SSE → UI working first. UI polish and mixed files second.

**CRITICAL**: Layer 6.5 (SSE) must be implemented before Layer 7 (UI) to avoid expensive polling.

---

## Integration Test Points

### Checkpoint 1: Backend Core (After Layer 3)
**Test**: Can we process a strategic file end-to-end via script?
- Create test script: `test-file-processing.js`
- Input: Sample strategic document
- Expected: File classified, chunked, compressed, saved to DB
- Success criteria: `file_chunks` table populated correctly

### Checkpoint 2: API Layer (After Layer 5A)
**Test**: Can we upload via HTTP request?
- Use `curl` or Postman
- POST file to `/api/files/upload`
- Expected: File processes in background, database updates
- Success criteria: API returns fileId, processing completes

### Checkpoint 3: Full Stack (After Layer 7)
**Test**: Can we upload via UI?
- Click paperclip, select file
- Expected: Upload succeeds, see in database
- Success criteria: User sees success (even if just in console)

---

## Safe Stopping Points

**Stop after Layer 2**: Utilities complete, no integration yet. Safe.

**Stop after Layer 3**: AI operations work independently. Safe.

**Stop after Layer 4**: Backend processing complete. Can test via scripts. Safe.

**Stop after Layer 5A**: Upload API works. Can test via curl. Safe.

**Stop after Layer 6**: State management ready. UI can be added later. Safe.

---

## Integration Risks & Mitigation

### Risk 1: Fireworks API Rate Limits
**Mitigation**: Implement retry logic with exponential backoff in all AI operations

### Risk 2: Long Processing Times Block User
**Mitigation**: Background processing via `setTimeout`, progress polling

### Risk 3: Silent Failures in Processing Pipeline
**Mitigation**: Try/catch at every layer, update file.status = 'failed' + error_message

### Risk 4: Breaking Existing Chat Functionality
**Mitigation**: File upload is isolated feature. Test chat still works after each checkpoint.

### Risk 5: Database Deadlocks from Concurrent Uploads
**Mitigation**: Each file gets unique ID, chunks isolated by file_id. No shared locks.

---

## Rollback Strategy

**If Layer 2-4 fails**: Delete code, branch remains clean. No user impact.

**If Layer 5 fails**: Disable upload API route (comment out export). No user impact.

**If Layer 6 fails**: Remove store imports from UI. Upload disabled, chat works.

**If Layer 7 fails**: Hide paperclip button via CSS. Feature invisible, app works.

**Nuclear option**: `git checkout main` - database tables remain but unused.

---

## External Dependencies Checklist

### NPM Packages Needed
- [ ] unpdf (PDF extraction)
- [ ] voyageai (embeddings)

### Environment Variables Needed
- [x] FIREWORKS_API_KEY (already exists)
- [ ] VOYAGE_API_KEY (need to add)
- [x] PUBLIC_SUPABASE_URL (already exists)
- [x] PUBLIC_SUPABASE_ANON_KEY (already exists)

### API Credentials Needed
- [x] Fireworks AI account (already have)
- [ ] Voyage AI account (need to create)

---

## Testing Strategy Per Layer

**Layer 2**: Unit tests with sample files
**Layer 3**: Integration tests with real API calls (dev only)
**Layer 4**: End-to-end script test
**Layer 5**: HTTP request tests (curl/Postman)
**Layer 6**: Store behavior tests (manual verification)
**Layer 7**: UI interaction tests (manual + Playwright optional)

---

## Definition of Done (Per Chunk)

A chunk is complete when:
1. ✅ Code written and compiles
2. ✅ Manual test passes (with sample data)
3. ✅ Error handling added (try/catch, user-facing messages)
4. ✅ Integration point verified (connects to dependent layer)
5. ✅ Documentation updated (implementation tracker)
6. ✅ Main branch still works (chat unaffected)

---

## Next Steps

1. Install dependencies (unpdf, voyageai)
2. Get Voyage AI API key
3. Implement Layer 2 (Text Extraction + Vectorization)
4. Test each function independently
5. Move to Layer 3 once Layer 2 verified working
