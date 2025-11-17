# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Asura** is an AI-powered perpetual memory chat system for startup founders. It solves the asymmetry problem in AI chat applications where the AI loses memory of earlier conversations after N turns. The system uses a sophisticated three-tier memory architecture with "Artisan Cut" compression to maintain continuous conversation continuity indefinitely.

**Tech Stack:**
- Frontend: SvelteKit + TypeScript + Tailwind CSS v4
- Backend: Supabase (PostgreSQL + pgvector for vector search + Realtime for live updates)
- LLM: Qwen 2.5 235B via Fireworks AI (with automatic prompt caching)
- Embeddings: Voyage AI voyage-3 (1024 dimensions)
- File Processing: unpdf for PDFs, text extraction for other formats

## Essential Commands

### Development
```bash
npm run dev                 # Start dev server (Vite)
npm run build              # Build for production
npm run preview            # Preview production build
```

### Type Checking
```bash
npm run check              # Run svelte-check with TypeScript
npm run check:watch        # Run svelte-check in watch mode
```

### Testing
```bash
npm test                   # Run all unit + integration tests (Vitest)
npm run test:unit          # Run only unit tests
npm run test:integration   # Run only integration tests
npm run test:watch         # Run tests in watch mode
npm run test:ui            # Open Vitest UI
npm run test:coverage      # Run tests with coverage report

npm run test:e2e           # Run Playwright e2e tests
npm run test:e2e:ui        # Run Playwright tests with UI
npm run test:all           # Run all tests (unit + integration + e2e)
```

### MCP Tools (Development)
```bash
npm run mcp:supabase       # Access Supabase via MCP
npm run mcp:playwright     # Access Playwright via MCP
```

### Database
```bash
npx supabase start         # Start local Supabase (Docker required)
npx supabase db reset      # Reset database and run migrations
npx supabase db push       # Push local schema changes
```

## Core Architecture

### Multi-Call AI System (Call 1A → 1B → 2A → 2B)

Every user message triggers a **4-call sequence**:

1. **Call 1A** (Hidden): Initial response generation using assembled context
2. **Call 1B** (Streamed): Self-critique and refinement of 1A → shown to user
3. **Call 2A** (Background): Artisan Cut compression of turn into journal format
4. **Call 2B** (Background): Verification of 2A compression quality

**Pattern:** All calls use an **A-B verification pattern** where B verifies that A followed the rules correctly. B calls receive four inputs:
1. Original input (user query or file content)
2. A prompt (the rules that were applied)
3. A's output (what needs verification)
4. B prompt (verification instructions)

This self-verification mechanism produces higher quality output than single-pass generation, compensating for using a cheaper model.

### Three-Tier Memory Architecture

**Problem:** Traditional AI chat loses memory after N turns due to context window limits.

**Solution:** Asura maintains three memory tiers:

1. **Working Memory** (Last 5 turns) - `superjournal` table
   - Full, uncompressed conversation turns
   - Perfect recall of recent interactions
   - Loaded into every Call 1A/1B

2. **Recent Memory** (Last 100 turns) - `journal` table
   - Artisan Cut compressed turns (lossless high-signal compression)
   - Crystal clear memory of recent past (6-12 months equivalent)
   - Loaded into every Call 1A/1B

3. **Long-Term Memory** (Beyond turn 100) - `journal` table with vector search
   - Decision Arcs (50-150 char semantic summaries) + embeddings
   - Salience-weighted (1-10 scale) for importance ranking
   - Retrieved via semantic search (RAG) when journal count > 100
   - Loaded as many as fit within 40% context budget

### Context Assembly Priority System

Context is assembled in **6 priority levels** (see `src/lib/context-builder.ts`):

1. **Priority 1:** Last 5 Superjournal turns (working memory - full text)
2. **Priority 2:** Starred messages (user-curated important turns)
3. **Priority 3:** Instructions (persistent behavioral directives - global or persona-specific)
4. **Priority 4:** Last 100 Journal turns (compressed - truncates if budget exceeded)
5. **Priority 5:** Vector search results (semantic retrieval of Decision Arcs, only if journal count > 100)
6. **Priority 5.5:** File overviews (Chunk 0 from all uploaded files for discoverability)
7. **Priority 6:** File chunks vector search (semantic file content retrieval)

**40% Context Window Cap:** All context must fit within 40% of the model's context window (60% reserved for output generation). Priority 4 truncates if budget is exceeded.

### Artisan Cut Compression Technique

**NOT naive summarization.** Compression based on **regenerability** - keeping information that cannot be easily inferred, compressing information that can be regenerated from principles.

**User Messages (boss_essence):**
- **PRESERVE:** Technical details, numbers, names, timelines, specific features, strategic questions, emotional states, business updates
- **REMOVE:** Pure filler ("hey", "thanks"), grammatical padding, obvious repetitions

**AI Responses (persona_essence):**
- **PRESERVE:** Unique strategic insights not obvious from principles, specific recommendations, critical tactical guidance, diagnostic questions asked, what was chosen/rejected and WHY
- **REMOVE:** Tactical details derivable from principles, step-by-step methodologies, calculations regenerable from numbers, examples, analogies, background explanations, politeness/encouragement

### Decision Arcs: Semantic Memory Pointers

**Format:** 50-150 character compressed behavioral patterns
**Style:** Heavy punctuation (: ; , -) for compression
**Content:** Pattern type: specific behavior when condition
**Purpose:** Enable vector search into long-term memory

**Example:** `"Pricing strategy: considering 20% increase, testing approach"`

**Salience Scoring (1-10):**
- **High (8-10):** Foundational decisions (values, identity, pivots, irreversible choices)
- **Medium (5-7):** Strategic resource decisions (hiring, pricing, roadmap)
- **Low (1-4):** Tactical/exploratory (minor choices, questions, reversible decisions)

**Starred Messages:** Users can manually star turns, overriding salience to 10 (forces perpetual inclusion).

## Database Schema

### Key Tables

**`superjournal`** - Working memory (last 5 full turns)
```sql
id UUID, user_id UUID (nullable), persona_name TEXT,
user_message TEXT, ai_response TEXT,
created_at TIMESTAMPTZ, is_starred BOOLEAN
```

**`journal`** - Compressed turns + vector search
```sql
id UUID, superjournal_id UUID (FK CASCADE DELETE),
user_id UUID (nullable), persona_name TEXT,
boss_essence TEXT, persona_essence TEXT,
decision_arc_summary TEXT, salience_score INTEGER (1-10),
is_starred BOOLEAN, is_instruction BOOLEAN,
instruction_scope TEXT (global|gunnar|kirby),
file_name TEXT, file_type TEXT,
created_at TIMESTAMPTZ, embedding VECTOR(1024)
```
- HNSW index on `embedding` for fast vector search
- Instructions detection: `is_instruction=true` for persistent behavioral directives

**`files`** - File metadata and processing status
```sql
id UUID, user_id UUID (nullable), filename TEXT,
file_type TEXT (text|pdf|image|code|spreadsheet|other),
content_hash TEXT (SHA-256), status TEXT (pending|processing|ready|failed),
progress INTEGER (0-100), processing_stage TEXT,
error_message TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
```

**`file_chunks`** - Semantic file chunks with embeddings
```sql
id UUID, file_id UUID (FK CASCADE DELETE), user_id UUID (nullable),
chunk_index INTEGER (0=overview, 1+=detail chunks),
chunk_text TEXT, description TEXT (compressed),
embedding VECTOR(1024), created_at TIMESTAMPTZ,
UNIQUE(file_id, chunk_index)
```
- Chunk 0: File-level overview for discoverability ("that interview transcript")
- Chunks 1+: Semantic detail chunks
- HNSW index on `embedding` for semantic search

**`models`** - LLM model registry
```sql
id UUID, model_identifier TEXT, model_name TEXT,
context_window INTEGER, provider TEXT, created_at TIMESTAMPTZ
```

**`user_settings`** - User preferences
```sql
id UUID, user_id UUID (nullable), selected_model TEXT,
selected_persona TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
```

### Vector Search Functions

- `search_file_chunks(query_embedding, threshold, count, user_id)` - Find relevant chunks across all files
- `get_file_chunks(file_id)` - Get all chunks for a specific file in order

## File Processing Pipeline

Files are processed in 6 phases (see `src/lib/file-processor.ts`):

### Phase 1: Extraction (0-10%)
**Location:** `src/lib/file-extraction.ts`
- Extract text from buffer (PDF via unpdf, text files directly)
- Generate SHA-256 content hash for deduplication
- Classify file type, validate size (10MB limit)

### Phase 2: Overview + Semantic Chunking (10-30%)
**Location:** `src/lib/file-chunker.ts` - `generateOverviewAndChunks()`
- **NEW COMBINED APPROACH:** Single Call 3A + 3B generates BOTH file overview AND logical chunks
- **Chunk 0 (Overview):** 200-400 word file-level summary for discoverability
- **Detail Chunks:** Logical boundaries based on topic shifts (NOT arbitrary splits), 300-800 words each

**CRITICAL:** Chunk 0 is NOT optional. Without it, files are invisible as entities (only content is searchable).

### Phase 3: Chunk 0 Compression (30-40%)
**Location:** `src/lib/file-compressor.ts` - `compressChunk()`
- Compress file overview using `CALL3A_PROMPT` (Call 2A pattern)
- Verify with `CALL3B_PROMPT` (Call 2B pattern)
- Output: 200-400 char compressed description

### Phase 4: Detail Chunks Compression (40-70%)
- Compress each detail chunk using `MODIFIED_CALL2A_PROMPT` + `MODIFIED_CALL2B_PROMPT`
- **Batched:** 5 chunks at a time, 5s delays (rate limit compliance)
- Focus: Preserve behavioral directives, strategic content, exact data

### Phase 5: Embedding Generation (70-90%)
**Location:** `src/lib/vectorization.ts` - `generateEmbedding()`
- Generate Voyage AI voyage-3 embeddings (1024 dimensions) for compressed descriptions
- **Batched:** 5 embeddings at a time, 5s delays
- **Why embed descriptions, not raw text?** Compression removes noise, making embeddings more semantically precise

### Phase 6: Database Save (90-100%)
- Batch insert all chunks into `file_chunks` table
- Update `files` table: `status='ready'`, `progress=100`
- Broadcast completion via Supabase Realtime

## Prompt System Structure

All prompts are modular TypeScript files in `src/lib/prompts/`:

```
src/lib/prompts/
├── index.ts                 # Central export
├── base-instructions.ts     # Shared base instructions
├── persona-gunnar.ts        # Gunnar: YC Startup Mentor (execution, WHAT/HOW)
├── persona-kirby.ts         # Kirby: Guerrilla Marketer (marketing, growth)
├── call1a.ts                # Call 1A: Initial response generation
├── call1b.ts                # Call 1B: Response refinement
├── call2a.ts                # Call 2A: Chat turn compression
├── call2b.ts                # Call 2B: Compression verification
├── call3a.ts                # Call 3A: File overview + chunking
├── call3b.ts                # Call 3B: Overview verification
├── modified-call2a.ts       # Modified Call 2A: Detail chunk compression
└── modified-call2b.ts       # Modified Call 2B: Detail verification
```

**Import Pattern:**
```typescript
import {
  BASE_INSTRUCTIONS, PERSONA_GUNNAR, PERSONA_KIRBY,
  CALL1A_PROMPT, CALL1B_PROMPT, CALL2A_PROMPT, CALL2B_PROMPT,
  CALL3A_PROMPT, CALL3B_PROMPT,
  MODIFIED_CALL2A_PROMPT, MODIFIED_CALL2B_PROMPT
} from '$lib/prompts';
```

**CRITICAL:** File compressor prompts require `/nothink` prefix:
```typescript
const prompt = `/nothink\n\n${CALL3A_PROMPT}`;
```
Chat prompts do NOT use `/nothink` (handled differently).

## Key Implementation Patterns

### Batch Processing with Rate Limiting
**Location:** `src/lib/batch-processor.ts`

```typescript
await processBatched(
  items,
  processFn,
  { batchSize: 5, delayBetweenBatchesMs: 5000, onProgress: async (completed, total) => {} }
);
```
Used for detail chunk compression and embedding generation to comply with Fireworks AI and Voyage AI rate limits.

### Thinking Tags Extraction
**Location:** `src/routes/api/chat/+server.ts`

Helper functions handle `<think>` tags in LLM output:
- `extractJSON(text)`: Removes thinking tags, extracts JSON
- `extractThinking(text)`: Gets content inside thinking tags
- `extractMessage(text)`: Gets content outside thinking tags

### 40% Context Budget Enforcement
**Location:** `src/lib/context-builder.ts`

```typescript
const contextWindow = await getModelContextWindow(modelIdentifier);
const contextBudget = Math.floor(contextWindow * 0.4); // 40% cap
```
Priority 4 (last 100 journal) truncates if total tokens exceed budget.

### Chunk 0 Pattern
**CRITICAL:** Chunk 0 is the foundation of file-based perpetual memory.
- **With Chunk 0:** "That interview transcript" → AI finds file
- **Without Chunk 0:** Files invisible as entities, only content searchable

## Personas

**Gunnar** - YC Startup Mentor
- Focus: Execution, WHAT and HOW
- Style: Practical, direct, action-oriented
- Expertise: Product, engineering, operations

**Kirby** - Guerrilla Marketer
- Focus: Marketing, sales, growth
- Style: Creative, scrappy, experimental
- Expertise: Customer acquisition, positioning, messaging

**Selection:** User toggles via dropdown. Stored in `user_settings.selected_persona`.

## Instructions System

**Problem:** Persistent behavioral directives ("don't use sports analogies") must survive indefinitely.

**Solution:** `journal` table fields `is_instruction` and `instruction_scope` (global|gunnar|kirby).

**Detection Logic (in CALL2A_PROMPT):**
- User message contains behavioral directives: "don't", "never", "always", "stop", "avoid", "from now on"
- Combined with references to persona behavior/response style
- Set `is_instruction = true`

**Context Loading (Priority 3):**
```sql
SELECT * FROM journal
WHERE is_instruction = true
  AND (instruction_scope = 'global' OR instruction_scope = :currentPersona)
ORDER BY created_at ASC;
```

**Isolation:** Each persona operates independently. Gunnar's instructions never leak to Kirby.

## Cost Optimization Strategy

**LLM:** Qwen 2.5 235B via Fireworks AI (cheap, automatic prompt caching)
**Embeddings:** Voyage AI voyage-3 (cheap, high quality)

**Why 4 calls × cheap model beats 1 call × expensive model:**
- Automatic prompt caching reduces input token costs significantly
- Multi-call architecture compensates for quality gaps
- Self-critique ensures quality without expensive models
- Target: <$0.01 per user message (4 LLM calls + 1 embedding after turn 100)

## API Flow Example

User sends: "Should we raise prices 20%?"

**Call 1A (Hidden):** Initial response using assembled context (~15,000 input tokens)
**Call 1B (Streamed):** Polished response shown to user → saved to `superjournal`
**Call 2A (Background):** Compress into journal format with Decision Arc
**Call 2B (Background):** Verify compression quality → saved to `journal` with embedding

Total cost: ~$0.003-0.005 per message

## Critical Reminders

### Chunk 0 is NOT Optional
Without Chunk 0, files are invisible as entities. Always ensure Chunk 0 exists for file discoverability.

### 40% Context Budget is a Hard Constraint
All context must fit within 40% of model's context window. Priority system ensures high-signal loading first.

### Artisan Cut ≠ Summarization
Based on regenerability principle: Keep non-regenerable information, compress derivable content.

### Vector Search Activation Threshold
Only activate when journal count > 100 (before that, all journal entries already loaded in Priority 4).

### Always Batch API Calls
Detail chunk compression: 5 at a time, 5s delays
Embedding generation: 5 at a time, 5s delays

### `/nothink` Prefix for File Compression
File compressor requires `/nothink\n\n` prefix. Chat prompts do NOT.

## Current State & Limitations

**Single-user mode:** `user_id` nullable, always NULL
**No auth:** Supabase Auth not yet integrated (planned for future branch)
**RLS disabled:** Row-level security policies defined but disabled for development

## Git Workflow

**Current branch:** `file-processing-refactor`
**Recent focus:** Batch processing, rate limiting, file overview context injection, auto-scroll fixes
