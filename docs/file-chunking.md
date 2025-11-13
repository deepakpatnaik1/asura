# File Chunking Implementation

## Problem Statement

Asura processes files uploaded by users to make their content searchable and retrievable through the AI advisory system. This presents two distinct challenges:

### The Storage Challenge
Large files (10,000+ words) cannot be sent to the LLM in a single compression call:
- LLMs have context window limits
- Single-pass compression of massive documents produces poor quality
- Risk of hitting token limits mid-processing

### The Retrieval Challenge
Even if we successfully compress an entire file, we need semantic search capabilities:
- User asks: "What did I say about pricing strategy?"
- System needs to find relevant sections across all uploaded files
- Cannot search a single monolithic compressed blob
- Need individual searchable chunks with embeddings for vector similarity

**Key Insight**: We need chunking for BOTH storage (compression) AND retrieval (semantic search).

## Architecture Decision: Semantic Chunking with Embeddings

After evaluating multiple approaches, we selected **semantic chunking using embedding similarity** as the optimal solution.

### Approaches Considered

**1. Sliding Window with LLM Chunking** (Original Concept)
- 2000-word windows with 500-word overlap
- LLM identifies logical boundaries within each window
- 5-6 API calls for 10K word file
- **Cost**: ~$0.005-0.01 per file
- **Rejected**: Too expensive, complex overlap handling

**2. Map-Reduce Pattern**
- Split arbitrarily into fixed-size chunks
- Process each chunk independently
- Combine results
- **Cost**: $0 for chunking
- **Rejected**: Solves storage but NOT retrieval (chunks have no semantic boundaries)

**3. Semantic Chunking with Embeddings** (SELECTED)
- Generate embeddings for sentences/paragraphs
- Detect topic shifts via similarity drop
- Create chunks at semantic boundaries
- **Cost**: ~$0.0003 per 10K word file (Voyage AI)
- **Advantages**:
  - 20-30x cheaper than LLM-based approach
  - Produces semantically coherent chunks
  - Each chunk optimized for both compression AND retrieval
  - Industry-proven approach (RAG systems use this)

## Implementation Approach

### Phase 0: Generate File-Level Overview Chunk (CHUNK 0)

**CRITICAL REQUIREMENT**: Before semantic chunking, generate a file-level overview chunk that captures the document's metadata and overall context.

**Why Chunk 0 Exists**:
Without a file-level chunk, users cannot reference files by their nature ("that interview transcript", "the business plan I shared"). They can only find files by remembering specific topics within them. Chunk 0 makes files discoverable as entities, not just content containers.

**Example Problem**:
- User: "Hey, remember that interview with three experts? Let's discuss one aspect."
- Without Chunk 0: Vector search finds specific topic chunks (pricing, tech stack) but not the file itself
- With Chunk 0: Vector search finds "Interview transcript: 3 experts discuss AI compliance" → AI knows exactly which file

**Chunk 0 Properties**:
- Always `chunk_index = 0` in database
- Captures document-level metadata, not detailed content
- Gets its own embedding for vector search
- Compressed separately with overview-focused prompt (different from detail chunks)

**What Chunk 0 Should Contain**:
```
- Document type (interview, email, business plan, research paper, meeting notes, etc.)
- Key participants/authors (if mentioned)
- Overall subject matter
- Major themes/sections
- Document purpose/context
- Notable dates or timeframes
- Approximate length and structure
```

**Generation Strategy** (Hybrid Approach):

**For small files (≤ 2000 words)**:
```typescript
// Use first 1000 words as Chunk 0
const overviewText = fullText.split(/\s+/).slice(0, 1000).join(' ');
```

**For large files (> 2000 words)**:
```typescript
// LLM-generated overview using beginning + ending
const firstKWords = fullText.split(/\s+/).slice(0, 2000).join(' ');
const lastKWords = fullText.split(/\s+/).slice(-500).join(' ');

const prompt = `
Create a concise overview (200-400 words) of this document:

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

DO NOT summarize detailed content. Capture "what kind of document this is" and "what it's broadly about."
`;

const response = await callFireworksAPI(FILE_OVERVIEW_PROMPT, prompt);
```

**Cost**: 1 additional API call per large file (~$0.0001)

**Example Chunk 0 Output**:
```
File: AI-powered IT Compliance.md
Type: Interview transcript
Length: 10,004 words

Document: Multi-turn interview with 3 subject matter experts discussing an AI-powered
IT compliance platform startup concept. Participants explore market pain points,
solution architecture, go-to-market strategy, pricing model ($5/user/month usage-based),
technical implementation (PostgreSQL, pgvector), unit economics (CAC $800, LTV $4,500),
and fundraising plans ($2M seed round).

Major sections: Problem statement, solution overview, GTM strategy, pricing & unit
economics, technical architecture, team & hiring, fundraising timeline.

Format: Q&A style conversation covering strategic, technical, and financial aspects
of the business opportunity.
```

**Chunk 0 Compression**:
- Uses specialized `CHUNK_0_COMPRESSION_PROMPT` (metadata-focused)
- Different from `MODIFIED_CALL2_PROMPT` (detail-focused)
- Preserves document type, participants, broad themes
- Compresses tactical details, keeps strategic identifiers

**Chunk 0 in Database**:
```sql
INSERT INTO file_chunks (
  file_id,
  chunk_index,  -- 0 for overview
  chunk_text,   -- Full overview text (200-1000 words)
  description,  -- Compressed overview (Artisan Cut)
  embedding     -- Embedding of compressed overview
) VALUES (
  'file-uuid',
  0,  -- ← ALWAYS 0 for file-level chunk
  '[Full overview text from LLM or heuristic]',
  'Interview: 3 experts, AI compliance platform. Topics: market pain, solution arch, pricing ($5/user/mo), tech (PostgreSQL), GTM, fundraising ($2M seed).',
  [embedding vector 1024-dim]
);
```

### Phase 1: Semantic Boundary Detection (Chunks 1+)

**Input**: Full extracted file text (10,000 words)

**Algorithm**:
1. Split text into sentences or paragraphs (linguistic units)
2. Generate embeddings for each unit using Voyage AI (voyage-3, 1024 dimensions)
3. Calculate cosine similarity between consecutive embeddings
4. When similarity drops below threshold → topic shift detected → chunk boundary
5. Group units into chunks at boundaries

**Optimal Chunk Size**: 512-1024 tokens per chunk
- Small enough for high-quality LLM compression
- Large enough to contain complete semantic topics
- Matches industry best practices for RAG systems

**Example**:
```
File: "AI-powered IT Compliance.md" (10,004 words)

Semantic chunking produces:

Chunk 0 (FILE-LEVEL OVERVIEW):
  "Interview transcript: 3 experts discuss AI-powered IT compliance platform..."

Chunk 1 (DETAIL): Problem statement + market analysis
Chunk 2 (DETAIL): Solution architecture + product features
Chunk 3 (DETAIL): Pricing strategy + unit economics
Chunk 4 (DETAIL): Technical implementation + tech stack
Chunk 5 (DETAIL): GTM strategy + customer acquisition
Chunk 6 (DETAIL): Team structure + hiring plan
Chunk 7 (DETAIL): Fundraising timeline + investor targets

Units:
- Para 1: "We're building an AI compliance platform..." [embedding_1]
- Para 2: "The target market is mid-size companies..." [embedding_2]
- Para 3: "Our pricing strategy is usage-based..." [embedding_3]
- Para 4: "The technical architecture uses microservices..." [embedding_4]

Similarity scores:
- embedding_1 ↔ embedding_2: 0.85 (same topic: product overview)
- embedding_2 ↔ embedding_3: 0.72 (related topic: business model)
- embedding_3 ↔ embedding_4: 0.42 (topic shift! pricing → tech)

Chunks created:
- Chunk 1: Para 1-2 (product overview + market)
- Chunk 2: Para 3 (pricing strategy)
- Chunk 3: Para 4+ (technical architecture)
```

### Phase 2: Chunk Compression (Modified Call 2)

**CRITICAL**: Chunk 0 and detail chunks use DIFFERENT compression prompts.

#### For Chunk 0 (File-Level Overview)

**Prompt**: `CHUNK_0_COMPRESSION_PROMPT` (metadata-focused)

**Compression principles**:
- PRESERVE: Document type, participants, overall topic, major themes
- PRESERVE: High-level structure (sections, format)
- PRESERVE: Notable metadata (dates, context, purpose)
- COMPRESS: Detailed content summaries
- COMPRESS: Specific tactical information
- GOAL: Make file discoverable by its nature

**Example Input** (Chunk 0 overview text):
```
File: AI-powered IT Compliance.md
Type: Interview transcript
Length: 10,004 words

Document: Multi-turn interview with 3 subject matter experts discussing an AI-powered
IT compliance platform startup concept. Participants explore market pain points,
solution architecture, go-to-market strategy, pricing model ($5/user/month usage-based),
technical implementation (PostgreSQL, pgvector), unit economics (CAC $800, LTV $4,500),
and fundraising plans ($2M seed round).

Major sections: Problem statement, solution overview, GTM strategy, pricing & unit
economics, technical architecture, team & hiring, fundraising timeline.

Format: Q&A style conversation covering strategic, technical, and financial aspects
of the business opportunity.
```

**Call 2A Output**:
```json
{
  "filename": "AI-powered IT Compliance.md",
  "file_type": "text",
  "description": "Interview: 3 experts, AI compliance platform. Topics: market pain, solution arch, pricing ($5/user/mo), tech (PostgreSQL), GTM, fundraising ($2M seed)."
}
```

**Call 2B**: Verifies metadata preservation, refines if needed

#### For Chunks 1+ (Detail Content)

**Prompt**: `MODIFIED_CALL2A_PROMPT` (detail-focused)

**Compression principles** (Artisan Cut for Files):
- PRESERVE: Behavioral directives, strategic insights, exact numbers/dates/names
- PRESERVE: Specific recommendations and decisions
- PRESERVE: Critical tactical guidance
- COMPRESS: Background explanations, examples, filler
- COMPRESS: Derivable information
- GOAL: Lossless high-signal compression of content

**Example Input** (Chunk 3 detail text):
```
Pricing Strategy Discussion:

The team debated several pricing models before settling on usage-based pricing at
$5 per user per month. This was chosen over tiered pricing ($50/100/200 per month)
because it scales naturally with customer growth and reduces friction for mid-market
buyers.

Unit economics were projected as follows:
- Customer Acquisition Cost (CAC): $800 (assumes $50K annual marketing spend, 5% conversion)
- Lifetime Value (LTV): $4,500 (assumes 3-year retention, 50 users average)
- LTV:CAC ratio: 5.6x
- Gross margin target: 40%

The $5/user/month price point was validated through customer interviews with 15
hospital IT directors, 12 of whom indicated this was "very affordable" compared
to existing compliance tools ($15-25/user/month market rate).

Annual contracts would be preferred but monthly billing offered for flexibility.
No free tier to avoid support burden on early-stage team.
```

**Call 2A Output**:
```json
{
  "filename": "AI-powered IT Compliance.md",
  "file_type": "text",
  "description": "Pricing: $5/user/mo usage-based (vs tiered). Rationale: scales w/ growth, less friction mid-market. Unit econ: CAC $800, LTV $4.5K, ratio 5.6x, 40% margin. Validated: 15 hospital IT dirs, 12 said 'very affordable' vs market ($15-25/user/mo). Annual contracts preferred, monthly avail. No free tier."
}
```

**Call 2B**: Verifies number preservation, strategic insights retained

#### Compression Flow (All Chunks)

For each chunk (including Chunk 0):

**Call 2A: Initial Compression**
```typescript
const prompt = chunkIndex === 0 ? CHUNK_0_COMPRESSION_PROMPT : MODIFIED_CALL2A_PROMPT;

const response = await callFireworksAPI(
  prompt,
  `File: ${filename} (Chunk ${chunkIndex})\nFile Type: ${fileType}\n\n${chunkText}`
);
```

**Call 2B: Compression Verification**
```typescript
const verificationResponse = await callFireworksAPI(
  prompt,  // Same prompt as 2A
  response.content + '\n\n' + CALL2B_PROMPT
);
```

**Output**: JSON with compressed description, saved to database

### Phase 3: Embedding Generation

For each compressed chunk description:
1. Generate 1024-dimensional embedding via Voyage AI (voyage-3)
2. Use `inputType: 'document'` for stored content
3. This embedding is used for semantic search during retrieval

### Phase 4: Database Storage

Save each chunk to `file_chunks` table with:
- Original chunk text (for reference)
- Compressed description (for context loading)
- Embedding (for vector search)
- Metadata (chunk index, file reference)

## Database Schema

### files Table (Metadata Only)

```sql
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,  -- 'text' | 'pdf' | 'image' | 'code' | 'spreadsheet' | 'other'
  content_hash TEXT NOT NULL UNIQUE,  -- SHA-256 hash for deduplication

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'processing' | 'ready' | 'failed'
  progress INTEGER DEFAULT 0,  -- 0-100
  processing_stage TEXT,  -- 'extraction' | 'chunking' | 'compression' | 'embedding' | 'finalization'

  -- Metadata
  file_size INTEGER,  -- Bytes
  word_count INTEGER,
  chunk_count INTEGER DEFAULT 0,  -- Number of chunks created

  -- Error tracking
  error_message TEXT,
  error_code TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user queries
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_status ON files(status);
```

### file_chunks Table (Searchable Chunks)

```sql
CREATE TABLE file_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Chunk content
  chunk_index INTEGER NOT NULL,  -- Order within file (0, 1, 2, ...)
  chunk_text TEXT NOT NULL,  -- Original chunk text
  description TEXT,  -- Compressed via Modified Call 2A/2B (Artisan Cut)

  -- Vector search
  embedding VECTOR(1024),  -- Voyage AI voyage-3 embedding

  -- Metadata
  chunk_tokens INTEGER,  -- Approximate token count
  chunk_word_count INTEGER,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  UNIQUE(file_id, chunk_index)
);

-- Indexes
CREATE INDEX idx_file_chunks_file_id ON file_chunks(file_id);
CREATE INDEX idx_file_chunks_user_id ON file_chunks(user_id);

-- Vector similarity search index (HNSW for fast approximate search)
CREATE INDEX idx_file_chunks_embedding ON file_chunks
USING hnsw (embedding vector_cosine_ops);
```

**Key Design Decisions**:
- `user_id` duplicated in `file_chunks` for efficient user-scoped queries
- `chunk_index` maintains order for displaying full file context
- `chunk_text` preserved for reference (not just compressed description)
- `embedding` generated from `description` (compressed version) for efficient retrieval
- CASCADE delete ensures orphaned chunks are cleaned up

## Complete Processing Flow

### Step 1: File Upload (0-25% Progress)

**Location**: `file-processor.ts:createFilePending()`

**Operations**:
1. Extract text from buffer (PDF, text, etc.)
2. Generate SHA-256 content hash
3. Check for duplicates
4. Create `files` table record (status='pending', progress=0)
5. Return file ID to client

**Progress Updates**:
- 0%: Upload received
- 10%: Hash generated
- 20%: Text extracted
- 25%: Database record created

**Output**: File ID (UUID)

### Step 2: Generate File-Level Overview (25-30% Progress)

**Location**: `file-chunker.ts:generateFileOverview()` (TO BE IMPLEMENTED)

**Operations**:
1. Determine file size (small ≤ 2000 words vs large > 2000 words)
2. **For small files**: Extract first 1000 words as overview
3. **For large files**: Send first 2000 + last 500 words to LLM
4. LLM generates 200-400 word overview capturing document type, participants, themes
5. Store as Chunk 0 text

**Progress Updates**:
- 25%: Starting overview generation
- 30%: Overview created

**Output**: Chunk 0 text (file-level overview)

**Example Output** (10K word file):
```
File: AI-powered IT Compliance.md
Type: Interview transcript
Length: 10,004 words

Document: Multi-turn interview with 3 subject matter experts discussing an AI-powered
IT compliance platform startup concept. Participants explore market pain points,
solution architecture, go-to-market strategy, pricing model ($5/user/month usage-based),
technical implementation (PostgreSQL, pgvector), unit economics (CAC $800, LTV $4,500),
and fundraising plans ($2M seed round).

Major sections: Problem statement, solution overview, GTM strategy, pricing & unit
economics, technical architecture, team & hiring, fundraising timeline.

Format: Q&A style conversation covering strategic, technical, and financial aspects
of the business opportunity.
```

### Step 3: Semantic Chunking (30-40% Progress)

**Location**: `file-chunker.ts:chunkTextBySemantic()` (TO BE IMPLEMENTED)

**Operations**:
1. Split text into sentences/paragraphs
2. Generate embeddings for each unit (Voyage AI)
3. Calculate similarity between consecutive embeddings
4. Detect topic shifts (similarity drop)
5. Create chunks at semantic boundaries (Chunks 1+)

**Progress Updates**:
- 30%: Starting semantic chunking
- 33%: Embeddings generated
- 36%: Boundaries detected
- 40%: Semantic chunks created

**Output**: Array of semantic chunks (text segments, Chunks 1-N)

**Combined Output (Steps 2 + 3)**:
```typescript
{
  allChunks: [
    chunk0Text,      // File-level overview
    ...semanticChunks  // Detail chunks
  ],
  chunkCount: 11  // 1 overview + 10 detail chunks
}
```

### Step 4: Chunk Compression (40-75% Progress)

**Location**: `file-compressor.ts:compressChunk()` (MODIFIED)

**Operations**:
For each chunk (sequential processing, including Chunk 0):

**Chunk 0 Compression**:
1. Call 2A with `CHUNK_0_COMPRESSION_PROMPT` + Chunk 0 text
2. Call 2B verification with same prompt
3. Validates metadata preservation (document type, participants, themes)

**Chunks 1+ Compression**:
1. Call 2A with `MODIFIED_CALL2A_PROMPT` + chunk text
2. Call 2B verification with same prompt
3. Validates detail preservation (numbers, dates, strategic insights)

**Progress Updates**:
- 40%: Starting compression
- 43%: Chunk 0 compressed (1/11 chunks)
- 46%: Chunk 1 compressed (2/11 chunks)
- ...
- 75%: All 11 chunks compressed (linear interpolation per chunk)

**Output**: Array of compressed chunk descriptions (11 total: 1 overview + 10 detail)

**Example Output**:
```typescript
[
  {
    filename: "AI-powered IT Compliance.md",
    fileType: "text",
    description: "Interview: 3 experts, AI compliance platform. Topics: market pain, solution arch, pricing ($5/user/mo), tech (PostgreSQL), GTM, fundraising ($2M seed)."
  },
  {
    filename: "AI-powered IT Compliance.md",
    fileType: "text",
    description: "Problem: Compliance tools complex, expensive ($15-25/user/mo). Manual audits slow. Pain: hospitals 500+ beds struggle..."
  },
  // ... 9 more detail chunks
]
```

### Step 5: Chunk Embedding (75-90% Progress)

**Location**: `vectorization.ts:generateEmbedding()` (called for each chunk)

**Operations**:
For each compressed chunk description (including Chunk 0):
1. Generate 1024-dimensional embedding via Voyage AI (voyage-3)
2. Use `inputType: 'document'` for stored content
3. Validate embedding dimensions (must be exactly 1024)

**Progress Updates**:
- 75%: Starting embedding generation
- 76%: Chunk 0 embedding generated (1/11)
- 78%: Chunk 1 embedding generated (2/11)
- ...
- 90%: All 11 embeddings generated (linear interpolation per chunk)

**Output**: Array of embeddings (11 total: 1 overview + 10 detail)

**Example Output**:
```typescript
[
  [0.234, 0.891, 0.123, ...],  // Chunk 0 embedding (1024 dimensions)
  [0.456, 0.234, 0.678, ...],  // Chunk 1 embedding (1024 dimensions)
  // ... 9 more embeddings
]
```

**Key**: Chunk 0 embedding captures file-level semantic meaning, enabling discovery by document type and broad topics. Detail chunk embeddings capture specific content for precise retrieval.

### Step 6: Finalization (90-100% Progress)

**Location**: `file-processor.ts:markFileComplete()`

**Operations**:
1. Insert all chunks into `file_chunks` table (batch insert)
2. Update `files` table with chunk_count=11, status='ready', progress=100
3. Broadcast completion via Realtime

**Progress Updates**:
- 90%: Saving chunks
- 95%: Database updated
- 100%: File ready

**Output**: File processing complete

**Database State After Completion**:

**files table**:
```sql
UPDATE files SET
  status = 'ready',
  chunk_count = 11,
  progress = 100,
  processing_stage = 'finalization',
  updated_at = NOW()
WHERE id = 'file-uuid';
```

**file_chunks table** (11 rows):
```sql
-- Chunk 0 (File-level overview)
INSERT INTO file_chunks VALUES (
  'chunk-uuid-0',
  'file-uuid',
  'user-uuid',
  0,  -- chunk_index
  '[Full 300-word overview text]',
  'Interview: 3 experts, AI compliance platform. Topics: market pain, solution arch, pricing ($5/user/mo)...',
  [embedding vector 1024-dim],
  75,   -- chunk_tokens
  300,  -- chunk_word_count
  NOW()
);

-- Chunk 1 (Problem statement detail)
INSERT INTO file_chunks VALUES (
  'chunk-uuid-1',
  'file-uuid',
  'user-uuid',
  1,  -- chunk_index
  '[Full 1000-word problem statement text]',
  'Problem: Compliance tools complex, expensive ($15-25/user/mo)...',
  [embedding vector 1024-dim],
  250,  -- chunk_tokens
  1000, -- chunk_word_count
  NOW()
);

-- ... 9 more detail chunks (chunk_index 2-10)
```

**Result**: File is now searchable by:
1. **Broad references**: "that interview transcript" → Matches Chunk 0
2. **Specific content**: "pricing strategy" → Matches Chunk 3
3. **Cross-file queries**: "compliance tools" → Matches chunks across multiple files

## API Specifications

### file-chunker.ts (NEW MODULE)

```typescript
/**
 * file-chunker.ts
 *
 * Semantic chunking using embedding similarity to detect topic boundaries
 */

export interface ChunkingInput {
  text: string;           // Full extracted file text
  maxChunkTokens?: number;  // Default: 1024
  similarityThreshold?: number;  // Default: 0.5 (topic shift detection)
}

export interface ChunkingOutput {
  chunks: string[];       // Array of chunk texts
  boundaries: number[];   // Character positions of chunk boundaries
  chunkWordCounts: number[];
  chunkTokenCounts: number[];
}

/**
 * Split text into semantic chunks using embedding similarity
 *
 * Algorithm:
 * 1. Split text into sentences/paragraphs
 * 2. Generate embeddings for each unit
 * 3. Calculate cosine similarity between consecutive units
 * 4. When similarity < threshold, create chunk boundary
 * 5. Group units into chunks
 *
 * @param input - Text and chunking parameters
 * @returns Array of semantic chunks
 */
export async function chunkTextBySemantic(
  input: ChunkingInput
): Promise<ChunkingOutput> {
  // Implementation details
}

/**
 * Helper: Split text into sentences using NLP-style tokenization
 */
function splitIntoSentences(text: string): string[] {
  // Implementation
}

/**
 * Helper: Calculate cosine similarity between two embeddings
 */
function cosineSimilarity(a: number[], b: number[]): number {
  // Implementation
}
```

### file-compressor.ts (MODIFICATIONS)

**Current**: `compressFile()` receives full file text

**New**: `compressChunk()` receives single chunk

```typescript
export interface ChunkCompressionInput {
  chunkText: string;      // Single chunk text (512-1024 tokens)
  chunkIndex: number;     // Position in file (0, 1, 2, ...)
  filename: string;
  fileType: string;
}

export interface ChunkCompressionOutput {
  filename: string;
  fileType: string;
  description: string;    // Artisan Cut compressed chunk
}

/**
 * Compress a single chunk using Modified Call 2A/2B
 *
 * Call 2A: Initial compression
 * Call 2B: Verification and refinement
 *
 * @param input - Chunk text and metadata
 * @returns Compressed chunk description
 */
export async function compressChunk(
  input: ChunkCompressionInput
): Promise<ChunkCompressionOutput> {
  // Call 2A
  const call2aResponse = await callFireworksAPI(
    MODIFIED_CALL2A_PROMPT,
    `File: ${input.filename} (Chunk ${input.chunkIndex + 1})\nFile Type: ${input.fileType}\n\n${input.chunkText}`
  );

  // Call 2B (verification)
  const call2bResponse = await callFireworksAPI(
    MODIFIED_CALL2A_PROMPT,
    call2aResponse.content + '\n\n' + CALL2B_PROMPT
  );

  return parseCompressedJSON(call2bResponse.content);
}
```

### file-processor.ts (MODIFICATIONS)

**New function**: `processFileChunks()`

```typescript
/**
 * Process file with semantic chunking (background task)
 *
 * Flow:
 * 1. Chunk text semantically (25-40%)
 * 2. Compress each chunk (40-75%)
 * 3. Generate embeddings (75-90%)
 * 4. Save to database (90-100%)
 */
export async function processFileBackground(
  fileId: string,
  extraction: ExtractionResult,
  filename: string,
  options?: { onProgress?: ProgressCallback; }
): Promise<void> {

  // Phase 1: Semantic Chunking (25-40%)
  await reportProgress(options?.onProgress, fileId, 'chunking', 25, 'Starting chunking...');
  const chunking = await chunkTextBySemantic({
    text: extraction.text,
    maxChunkTokens: 1024,
    similarityThreshold: 0.5
  });
  await reportProgress(options?.onProgress, fileId, 'chunking', 40, `Created ${chunking.chunks.length} chunks`);

  // Phase 2: Compress each chunk (40-75%)
  await reportProgress(options?.onProgress, fileId, 'compression', 40, 'Starting compression...');
  const compressed: ChunkCompressionOutput[] = [];
  for (let i = 0; i < chunking.chunks.length; i++) {
    const chunkCompressed = await compressChunk({
      chunkText: chunking.chunks[i],
      chunkIndex: i,
      filename,
      fileType: extraction.fileType
    });
    compressed.push(chunkCompressed);

    // Linear progress interpolation
    const progress = 40 + (35 * (i + 1) / chunking.chunks.length);
    await reportProgress(options?.onProgress, fileId, 'compression', progress, `Compressed chunk ${i + 1}/${chunking.chunks.length}`);
  }

  // Phase 3: Generate embeddings (75-90%)
  await reportProgress(options?.onProgress, fileId, 'embedding', 75, 'Generating embeddings...');
  const embeddings: number[][] = [];
  for (let i = 0; i < compressed.length; i++) {
    const embedding = await generateEmbedding(compressed[i].description);
    embeddings.push(embedding);

    const progress = 75 + (15 * (i + 1) / compressed.length);
    await reportProgress(options?.onProgress, fileId, 'embedding', progress, `Generated embedding ${i + 1}/${compressed.length}`);
  }

  // Phase 4: Save to database (90-100%)
  await reportProgress(options?.onProgress, fileId, 'finalization', 90, 'Saving chunks...');
  await saveFileChunks(fileId, {
    chunks: chunking.chunks,
    descriptions: compressed.map(c => c.description),
    embeddings,
    chunkTokenCounts: chunking.chunkTokenCounts,
    chunkWordCounts: chunking.chunkWordCounts
  });

  await markFileComplete(fileId, compressed.length);
  await reportProgress(options?.onProgress, fileId, 'finalization', 100, 'File ready');
}

/**
 * Save all chunks to file_chunks table (batch insert)
 */
async function saveFileChunks(
  fileId: string,
  data: {
    chunks: string[];
    descriptions: string[];
    embeddings: number[][];
    chunkTokenCounts: number[];
    chunkWordCounts: number[];
  }
): Promise<void> {
  // Get user_id from files table
  const { data: file } = await supabase
    .from('files')
    .select('user_id')
    .eq('id', fileId)
    .single();

  // Batch insert all chunks
  const chunks = data.chunks.map((chunk, i) => ({
    file_id: fileId,
    user_id: file.user_id,
    chunk_index: i,
    chunk_text: chunk,
    description: data.descriptions[i],
    embedding: data.embeddings[i],
    chunk_tokens: data.chunkTokenCounts[i],
    chunk_word_count: data.chunkWordCounts[i]
  }));

  await supabase.from('file_chunks').insert(chunks);
}
```

## Cost Analysis

### Semantic Chunking Approach with Chunk 0 (SELECTED)

**10,000 word file example**:

1. **Chunk 0 Generation** (File-Level Overview):
   - LLM generates overview from first 2000 + last 500 words
   - 1 API call (2500 word input, 300 word output)
   - Fireworks AI (Qwen 2.5): ~$0.0001
   - Cost: $0.0001

2. **Chunking Phase** (Semantic Boundaries):
   - Split into ~50 sentences
   - Generate 50 embeddings (Voyage AI: $0.00006 per 1K tokens)
   - Estimate: 50 sentences × 20 tokens each = 1,000 tokens
   - Cost: $0.00006

3. **Compression Phase** (All Chunks):
   - **Chunk 0**: 1 chunk × 2 calls (Call 2A + 2B with CHUNK_0_COMPRESSION_PROMPT) = 2 API calls
   - **Chunks 1-10**: 10 semantic chunks × 2 calls each (Call 2A + 2B with MODIFIED_CALL2A_PROMPT) = 20 API calls
   - **Total**: 22 API calls
   - Fireworks AI (Qwen 2.5): ~$0.0001 per call (with prompt caching)
   - Cost: $0.0022

4. **Embedding Phase** (All Chunks):
   - **Chunk 0**: 1 description × ~100 tokens
   - **Chunks 1-10**: 10 descriptions × ~100 tokens each
   - **Total**: 11 descriptions = 1,100 tokens
   - Voyage AI: $0.00006 per 1K tokens
   - Cost: $0.000066

**Total cost per 10K word file**: $0.0001 + $0.00006 + $0.0022 + $0.000066 = **~$0.0033**

**Cost breakdown**:
- Chunk 0 generation: $0.0001 (3% of total)
- Semantic chunking: $0.00006 (2% of total)
- Compression (all chunks): $0.0022 (67% of total)
- Embeddings (all chunks): $0.000066 (2% of total)
- **Chunk 0 overhead**: ~$0.0002 (6% increase over no-Chunk-0 approach)

**Chunk 0 ROI**: Adds $0.0002 per file but enables file-level discovery ("that interview transcript") which is impossible without it. 6% cost increase for massive retrieval quality improvement.

### Comparison: LLM-Based Sliding Window (REJECTED)

**10,000 word file**:
- 5 sliding windows (2000 words each, 500 word overlap)
- 5 windows × 2 calls each (chunking + verification) = 10 API calls
- Each call: 2000 words input (~$0.001 per call)
- Cost: $0.01

**20-30x more expensive than semantic chunking**

### Comparison: Map-Reduce (REJECTED)

**10,000 word file**:
- $0 for chunking (arbitrary splits)
- But: No semantic coherence, poor retrieval quality
- Cannot search chunks effectively

## Retrieval Flow (Query Time)

**The Power of Chunk 0**: File-level chunks enable both broad file discovery AND specific content retrieval.

### Scenario 1: Broad File Reference

**User query**: "Hey, remember that interview with three experts? Let's discuss one aspect."

**Step 1**: Generate query embedding
```typescript
const queryEmbedding = await generateEmbedding("interview with three experts");
```

**Step 2**: Vector search across all user's file chunks
```sql
SELECT
  fc.id,
  fc.file_id,
  fc.chunk_index,
  fc.chunk_text,
  fc.description,
  f.filename,
  1 - (fc.embedding <=> $1::vector) AS similarity
FROM file_chunks fc
JOIN files f ON fc.file_id = f.id
WHERE fc.user_id = $2
ORDER BY fc.embedding <=> $1::vector  -- Cosine distance
LIMIT 5;
```

**Results**:
```
1. Chunk 0, file_id: abc-123, similarity: 0.92
   description: "Interview: 3 experts, AI compliance platform. Topics: market pain,
                 solution arch, pricing ($5/user/mo), tech (PostgreSQL), GTM..."
   filename: "AI-powered IT Compliance.md"

2. Chunk 3, file_id: abc-123, similarity: 0.65
   description: "GTM strategy discussion: Target mid-market, sales motion, CAC/LTV..."

3. Chunk 0, file_id: def-456, similarity: 0.58
   description: "Email thread: 2 co-founders discuss product roadmap priorities..."
   filename: "Product Roadmap Discussion.eml"
```

**Step 3**: AI response
```
Yes, the interview transcript with 3 experts about the AI-powered IT compliance
platform (AI-powered IT Compliance.md). That conversation covered:
- Market pain points and opportunity sizing
- Solution architecture and product features
- Pricing strategy ($5/user/month usage-based)
- Technical implementation (PostgreSQL, pgvector)
- GTM strategy and customer acquisition
- Fundraising plans ($2M seed round)

Which aspect would you like to explore?
```

**Key**: Chunk 0 (file-level overview) was the top match, allowing AI to identify the specific file and provide context about what it contains.

### Scenario 2: Specific Content Query

**User query**: "What did I say about pricing strategy?"

**Step 1**: Generate query embedding
```typescript
const queryEmbedding = await generateEmbedding("pricing strategy");
```

**Step 2**: Same vector search query

**Results**:
```
1. Chunk 3, file_id: abc-123, similarity: 0.89
   description: "Pricing strategy: $5/user/month usage-based model. Annual contracts
                 preferred. CAC $800, LTV $4,500. Target 40% gross margin..."
   filename: "AI-powered IT Compliance.md"

2. Chunk 0, file_id: abc-123, similarity: 0.72
   description: "Interview: 3 experts, AI compliance platform. Topics: market pain,
                 pricing ($5/user/mo)..."
   filename: "AI-powered IT Compliance.md"

3. Chunk 5, file_id: xyz-789, similarity: 0.68
   description: "SaaS pricing tiers: Basic $29/mo, Pro $99/mo, Enterprise custom..."
   filename: "Competitor Analysis.pdf"
```

**Step 3**: AI response
```
In the interview transcript (AI-powered IT Compliance.md), you discussed a usage-based
pricing model at $5 per user per month with annual contracts preferred. The unit
economics were projected as:
- Customer Acquisition Cost (CAC): $800
- Lifetime Value (LTV): $4,500
- LTV:CAC ratio: 5.6x
- Target gross margin: 40%

The pricing was positioned as affordable for mid-market hospitals (500+ beds) while
maintaining healthy margins for the business.
```

**Key**: Chunk 3 (specific content) was the top match, but Chunk 0 also ranked high, providing file context. AI gets both specific details AND document metadata.

### Scenario 3: Cross-File Query

**User query**: "Have I discussed pricing models before?"

**Results** (chunks from multiple files):
```
1. Chunk 3, file_id: abc-123, similarity: 0.87
   description: "Pricing strategy: $5/user/month usage-based..."
   filename: "AI-powered IT Compliance.md"

2. Chunk 5, file_id: xyz-789, similarity: 0.84
   description: "SaaS pricing tiers: Basic $29/mo, Pro $99/mo..."
   filename: "Competitor Analysis.pdf"

3. Chunk 0, file_id: abc-123, similarity: 0.78
   description: "Interview: 3 experts, AI compliance platform. Topics: pricing..."

4. Chunk 2, file_id: qrs-456, similarity: 0.71
   description: "Freemium vs paid tiers debate. Decided against free tier due to..."
   filename: "Product Strategy Notes.md"

5. Chunk 0, file_id: xyz-789, similarity: 0.69
   description: "Competitive analysis: 12 SaaS compliance tools, pricing models..."
```

**AI response**:
```
Yes, you've discussed pricing in several documents:

1. AI Compliance Interview (AI-powered IT Compliance.md): $5/user/month usage-based
   model with strong unit economics (LTV:CAC 5.6x)

2. Competitor Analysis (Competitor Analysis.pdf): Analyzed 12 SaaS competitors with
   tiered pricing ($29-$99/mo basic tiers, enterprise custom)

3. Product Strategy Notes (Product Strategy Notes.md): Decided against freemium
   model, opting for paid-only approach

Would you like to compare these pricing approaches or revisit any specific decision?
```

**Key**: Chunk 0 entries from multiple files appear in results, giving AI awareness of which files contain pricing discussions, even if detailed chunks rank higher.

### How Chunk 0 Changes Retrieval Quality

**Without Chunk 0**:
- User: "That interview with experts..."
- Search finds: Random topic chunks from various files
- AI: "I don't see any interviews in your files. Can you be more specific?"
- Problem: No way to identify files by their nature/type

**With Chunk 0**:
- User: "That interview with experts..."
- Search finds: Chunk 0 with "Interview transcript: 3 experts..."
- AI: "Yes, the interview about AI compliance. What aspect?"
- Solution: Files are discoverable as entities

### Loading Chunks into LLM Context (Call 1A/1B)

**Step 1**: Vector search returns top 5 chunks (mix of Chunk 0s and detail chunks)

**Step 2**: Load compressed descriptions into Call 1A context
```typescript
const relevantChunks = vectorSearchResults.map(result => ({
  filename: result.filename,
  chunkIndex: result.chunk_index,
  isOverview: result.chunk_index === 0,
  description: result.description
}));

// Add to Call 1A prompt
const fileContext = `
Relevant file chunks from vector search:

${relevantChunks.map(chunk =>
  `[${chunk.filename}${chunk.isOverview ? ' - OVERVIEW' : ` - Chunk ${chunk.chunkIndex}`}]
  ${chunk.description}`
).join('\n\n')}
`;
```

**Step 3**: LLM sees both file-level context AND specific content
```
Relevant file chunks from vector search:

[AI-powered IT Compliance.md - OVERVIEW]
Interview: 3 experts, AI compliance platform. Topics: market pain, solution arch,
pricing ($5/user/mo), tech (PostgreSQL), GTM, fundraising ($2M seed).

[AI-powered IT Compliance.md - Chunk 3]
Pricing strategy: $5/user/month usage-based model. Annual contracts preferred.
CAC $800, LTV $4,500. Target 40% gross margin. Positioning: affordable for
mid-market hospitals while maintaining healthy margins.

[Competitor Analysis.pdf - OVERVIEW]
Competitive analysis: 12 SaaS compliance tools. Compared pricing models, feature
sets, GTM strategies. Created positioning matrix and identified whitespace.

[Competitor Analysis.pdf - Chunk 5]
SaaS pricing tiers observed: Basic $29/mo (small teams), Pro $99/mo (departments),
Enterprise custom (large orgs). All use tiered model except two (usage-based).
```

**Result**: LLM has both "what files exist" (Chunk 0s) and "what's in them" (detail chunks).

## Why This Matters for Perpetual Memory

**The Chunk 0 Pattern Solves**:
1. **File Discovery**: Users can reference "that business plan" or "the email thread"
2. **Cross-File Awareness**: AI knows what documents exist in the knowledge base
3. **Contextual Retrieval**: Even specific queries benefit from file-level context
4. **Better Responses**: AI can say "In your interview transcript..." vs "According to this information..."

**Without Chunk 0**: Files are invisible containers. Only their content is searchable.

**With Chunk 0**: Files are first-class entities in perpetual memory, discoverable and referenceable just like conversation turns.

## Edge Cases

### Re-Uploading Same File
- Content hash matches existing file
- Update existing `files` record instead of creating new one
- Delete old `file_chunks` entries
- Re-process with new chunking/compression
- Maintains single source of truth per unique file

### File + Query Simultaneously
- User uploads file AND asks question at same time
- File processing blocks query execution
- Sequential: Chunk → Compress → Embed → Save
- Only then execute Call 1A/1B with chunks available in context
- User waits longer but gets complete response

### Very Large Files (Approaching 10MB Limit)
- More chunks created (e.g., 50 chunks for huge file)
- Linear cost scaling
- Progress updates more granular
- May take 30-60 seconds to complete

### Failed Chunk Processing
- If single chunk compression fails → retry once
- If retry fails → mark chunk as failed, continue with others
- File marked as 'ready' but with partial chunks
- Error logged in files.error_message

## Success Metrics

1. **Compression Quality**: Artisan Cut preserves strategic insights, exact numbers, behavioral directives
2. **Retrieval Accuracy**: Vector search returns semantically relevant chunks (not just keyword matches)
3. **Cost Efficiency**: <$0.01 per 10K word file (storage + retrieval)
4. **Processing Speed**: <30 seconds for 10K word file (end-to-end)
5. **Progress UX**: No phase shows 0% for >1 second
6. **Chunk Coherence**: Each chunk contains complete semantic topic (no mid-sentence cuts)

## Implementation Status

- [x] Database schema designed
- [ ] `file-chunker.ts` implementation
- [ ] `file-compressor.ts` modifications (chunk-level processing)
- [ ] `file-processor.ts` modifications (orchestration)
- [ ] `file_chunks` table migration
- [ ] Vector search query implementation
- [ ] Progress bar granular updates (0-25% extraction phase)
- [ ] Integration testing with 10K word file
- [ ] End-to-end retrieval testing

## Next Steps

1. **Implement `file-chunker.ts`** with:
   - `generateFileOverview()` - Creates Chunk 0
   - `chunkTextBySemantic()` - Creates Chunks 1+
   - `cosineSimilarity()` - Helper for boundary detection
2. **Modify `file-compressor.ts`** to:
   - Accept `chunkIndex` parameter
   - Use `CHUNK_0_COMPRESSION_PROMPT` for chunk_index=0
   - Use `MODIFIED_CALL2A_PROMPT` for chunk_index>0
3. **Update `file-processor.ts`** orchestration:
   - Call `generateFileOverview()` at 25-30%
   - Call `chunkTextBySemantic()` at 30-40%
   - Compress all chunks (0-N) at 40-75%
   - Generate embeddings for all chunks at 75-90%
4. **Create `file_chunks` table migration**
5. **Test with "AI-powered IT Compliance.md"** (10,004 words)
6. **Measure timing** and validate progress updates
7. **Test retrieval** with sample queries:
   - "that interview transcript" (should find Chunk 0)
   - "pricing strategy" (should find detail chunk)

---

## ⚠️ CRITICAL: Why Chunk 0 Must Never Be Forgotten

This documentation was written because **Chunk 0 was completely omitted in the previous implementation**, causing a catastrophic loss of file discoverability.

### What Was Lost

**Without Chunk 0**:
- Files were invisible as entities
- Only granular content chunks existed
- Users could not reference "that interview" or "the business plan"
- Cross-file awareness was impossible
- AI had no context about document types, participants, or overall themes

### The Cost of Forgetting

**Previous implementation**:
- Spent days implementing semantic chunking
- Built compression pipeline
- Generated embeddings
- **FORGOT** the most important chunk: the file-level overview

**Result**: Files became searchable by content but not discoverable as documents. Like having a library where you can only search by sentence, not by book title.

### Lesson Learned

**Chunk 0 is NOT optional. It is the foundation of file-based perpetual memory.**

When implementing `file-chunker.ts`:
1. **FIRST** generate Chunk 0 (file-level overview)
2. **THEN** generate Chunks 1+ (detail content)
3. **NEVER** skip Chunk 0, even for small files

When compressing chunks:
1. Use `CHUNK_0_COMPRESSION_PROMPT` for chunk_index=0
2. Use `MODIFIED_CALL2A_PROMPT` for chunk_index>0
3. Validate that Chunk 0 preserves document type, participants, themes

When storing chunks:
1. Chunk 0 gets `chunk_index = 0` (ALWAYS)
2. Detail chunks get `chunk_index = 1, 2, 3, ...`
3. Verify Chunk 0 exists before marking file as ready

### Verification Checklist

Before deploying file chunking implementation:

- [ ] `generateFileOverview()` function exists
- [ ] It is called BEFORE semantic chunking
- [ ] Chunk 0 text is added to chunks array at index 0
- [ ] `CHUNK_0_COMPRESSION_PROMPT` prompt exists
- [ ] Compression logic checks `chunkIndex === 0` to select prompt
- [ ] Database insert includes Chunk 0 with `chunk_index = 0`
- [ ] Vector search returns Chunk 0 for broad file queries
- [ ] Test query: "that interview transcript" → Returns Chunk 0
- [ ] Test query: "pricing strategy" → Returns detail chunk + Chunk 0 context

**If ANY of these checks fail, the implementation is incomplete.**

### Remember

Files are first-class entities in Asura's perpetual memory. Chunk 0 makes them discoverable, referenceable, and contextually aware. Without it, files are just invisible containers of disconnected content chunks.

**Never forget Chunk 0 again.**
