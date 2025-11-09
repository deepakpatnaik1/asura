# File Uploads: Design & Business Logic

## Philosophy

**RAG vs Journal Approach**

- **RAG (Retrieval-Augmented Generation)**: "Phone book" lookup - semantically similar chunks retrieved on demand. Good for factual lookups, bad for holistic understanding.
- **Journal Approach**: AI has full understanding via Artisan Cut compression. Good for strategic reasoning, synthesis, pattern recognition.
- **Asura's Approach**: Hybrid - intelligently choose based on content type.

## File Type Classification

Files are automatically classified by Qwen3-VL-4B into three categories:

1. **Strategic**: Journal entries, interview transcripts, strategic documents, reflections
   - Requires deep understanding
   - Processed via Artisan Cut compression
   - Stored as Decision Arcs with embeddings

2. **Factual**: Industry reports, financial statements, data-heavy documents
   - Requires accurate lookup
   - Processed via RAG pipeline
   - Stored as raw chunks with embeddings

3. **Mixed**: Documents with both strategic insights and factual data (e.g., expert interview with recommendations + data)
   - Hybrid processing
   - Each chunk classified and routed appropriately

**Classification is automatic** - Qwen3-VL-4B decides based on content analysis.

## Chunking Strategy

**Logical Chunking, Not Token-Based**

- Think "table of contents" - natural document sections
- Qwen3-VL-4B (local via Nexa SDK) analyzes document structure
- Identifies logical boundaries: chapters, sections, topics
- No arbitrary token limits - chunks follow document's inherent structure
- **Chunks do NOT rearrange text** - they preserve document order, just identify natural boundaries

**Why Local Vision Model (Qwen3-VL-4B)?**
- Near-instant processing (no API latency)
- Can "see" document structure (headings, formatting, layout)
- Multimodal understanding (text + visual layout + images if present)
- Zero API cost
- Nexa SDK has exclusive GGUF support for Qwen3-VL

**Chunk Size Guideline**
- Target: Similar length to conversation turns (few hundred words)
- Actual size determined by logical boundaries
- Better to have meaningful sections than arbitrary token windows

**Key Insight**: After chunking, files become conversation-sized pieces. From that point forward, the pipeline is identical for both files and message turns.

## Processing Pipeline - Strategic Files

### Complete Flow (Strategic File Example: 10,000-word journal entry)

**Upload:**
1. User uploads file via paperclip or drag-and-drop
2. Qwen3-235B (Fireworks) classifies entire file as "strategic"
3. Qwen3-235B (Fireworks) chunks into ~15-20 logical sections

**For each chunk:**
4. Call 2A (Qwen3-235B via Fireworks): Initial Artisan Cut compression
5. Call 2B (Qwen3-235B via Fireworks): Compression verification
6. Result: `chunk_essence`, `decision_arc_summary`, `salience_score`
7. Embedding model generates vector from `decision_arc_summary`
8. Save to `file_chunks` table

**Later - User Query:**
9. User asks: "What made me choose B2C?"
10. Embedding model generates vector from query
11. Vector search finds matching Decision Arcs (pgvector cosine similarity)
12. Retrieve corresponding **Artisan Cuts** (not Decision Arcs, not raw text)
13. Inject Artisan Cuts into Call 1A context alongside conversation memory
14. Call 1A/1B generate response with file context

**The Key: Decision Arc = search key. Artisan Cut = what goes into context.**

## Model Architecture

**Four roles, one model:**

1. **File chunking & classification** → Qwen3-235B (Fireworks AI)
2. **Artisan cutting (Call 2A/2B)** → Qwen3-235B (Fireworks AI)
3. **Conversation (Call 1A/1B)** → Qwen3-235B (Fireworks AI)
4. **Vector embeddings** → Voyage AI `voyage-3-large` (1024-dim)

**Simplified architecture:** One model (Qwen3-235B via Fireworks) handles everything - classification, chunking, compression, and conversation. This eliminates local dependencies, reduces complexity, and ensures full model precision.

**Why embeddings for both conversations AND files:**
- Embedding size is **fixed** (1024 dimensions) regardless of input text length
- Embedding of "pivot" = same size as embedding of 10,000-word file
- What changes: semantic richness captured
- Decision Arcs are distilled, semantically rich → better vector search results
- Same reason we use Decision Arcs for conversations

## Database Architecture

**Separate from Conversations**

The `journal` table is exclusively for conversation memory. Files are completely separate.

**New Tables:**

```sql
-- Files metadata
CREATE TABLE files (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  filename TEXT NOT NULL,
  file_type TEXT, -- 'strategic' | 'factual' | 'mixed'
  content_hash TEXT UNIQUE, -- for deduplication
  status TEXT, -- 'processing' | 'ready' | 'failed'
  processing_stage TEXT,
  progress INTEGER, -- 0-100
  total_chunks INTEGER,
  processed_chunks INTEGER,
  error_message TEXT,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- File chunks (both strategic and factual)
CREATE TABLE file_chunks (
  id UUID PRIMARY KEY,
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  chunk_index INTEGER, -- order in document
  chunk_type TEXT, -- 'strategic' | 'factual'

  -- For strategic chunks (Artisan Cut)
  chunk_essence TEXT, -- compressed understanding
  decision_arc_summary TEXT, -- distilled pattern
  salience_score INTEGER,

  -- For factual chunks (RAG)
  raw_content TEXT, -- original text for lookup

  -- Common fields
  embedding VECTOR(1024), -- 1024-dim embeddings
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Strategic chunk row:**
- `chunk_type = 'strategic'`
- `chunk_essence`, `decision_arc_summary`, `salience_score` populated
- `raw_content = NULL`
- `embedding` = vector of `decision_arc_summary`

**Factual chunk row:**
- `chunk_type = 'factual'`
- `raw_content` populated (original text preserved)
- `chunk_essence`, `decision_arc_summary`, `salience_score = NULL`
- `embedding` = vector of `raw_content`

**Deletion Behavior:**
- Delete file → CASCADE deletes all related chunks
- Clean removal from vector search
- No orphaned data

## UX Design

### Input Bar Layout

Three components from left to right:

1. **Paperclip icon** (button 1) - Click to open macOS file picker
2. **Text input area** - Message composition
3. **File button** (button 3) - File management interface

### Upload Methods

**Method 1: Click**
- User clicks paperclip icon
- macOS file picker appears
- Select file → processing begins

**Method 2: Drag & Drop**
- User drags file into input bar
- Processing begins immediately

### File Management Dropdown

**Click file button** → Dropdown shows all uploaded files

Each file entry shows:
- Filename
- Status indicator (ready / processing with %)
- Delete icon (same style as message turn delete)

**Delete action:**
- Click delete icon → file completely removed from memory
- Deleted from all tables (files + file_chunks via CASCADE)
- As if file never existed

### Processing Status

**Real progress tracking** (not fake UX theater):

**Progress stages:**
1. Upload (0-10%)
2. Extract text (10-20%)
3. Classification (20-30%) - Qwen3-VL-4B local
4. Chunking (30-50%) - Qwen3-VL-4B local
5. Processing chunks (50-95%) - Call 2A/2B for each chunk
   - Shows current/total: "Processing chunk 5/12"
6. Complete (100%)

**UI behavior during processing:**
- Text input: **Enabled** (can continue chatting)
- Paperclip: **Enabled** (can upload more files in parallel)
- File button: Shows aggregate status if multiple files processing

**Progress display:**
- Circular progress indicator (0-100%)
- Stage text: "Analyzing document..." / "Compressing chunks 5/12"
- Real progress based on actual completed work
- No fake smoothing - jumps reflect real completion

**Error handling:**
- Failed files show: "❌ filename.pdf (failed - retry?)"

### File Button States

**Before any uploads:**
- Empty state, no badge

**During processing:**
- Shows progress indicator
- Badge shows count of processing files

**After processing complete:**
- Badge shows count of ready files
- Click → dropdown with all files

## Context Integration

When user asks a question:

**Vector search across:**
1. `journal` table - conversation Decision Arcs
2. `file_chunks` table - both strategic and factual

**Inject into Call 1A context:**
- Working memory (last 5 Superjournal)
- Recent memory (last 100 Journal)
- Relevant file chunks:
  - **Strategic chunks**: Artisan Cuts (compressed understanding)
  - **Factual chunks**: raw_content (for accurate lookup)

**Files persist perpetually** - same memory architecture as conversations.

## Key Design Decisions

1. **Automatic classification** - Qwen3-VL-4B decides strategic vs factual
2. **Logical chunking** - Document structure, not token limits
3. **Local processing** - Qwen3-VL-4B via Nexa SDK for speed and cost
4. **Separate tables** - Files isolated from conversation journal
5. **Hybrid approach** - Artisan Cut for strategic, RAG for factual
6. **Identical pipeline after chunking** - Files and message turns processed the same way
7. **Decision Arcs as search keys** - Distilled semantic meaning for better vector search
8. **Artisan Cuts in context** - Compressed understanding (not raw, not Decision Arc)
9. **Real progress** - Actual work completed, not simulated
10. **Perpetual memory** - Files never forgotten, same as conversations
11. **Clean deletion** - Complete removal when user requests
12. **Parallel uploads** - Multiple files can process simultaneously
13. **Non-blocking** - User can continue chatting during processing

## Processing Pipeline - Factual Files

### Complete Flow (Factual File Example: 50-page industry report)

**Upload:**
1. User uploads file via paperclip or drag-and-drop
2. Qwen3-235B (Fireworks) classifies entire file as "factual"
3. Qwen3-235B (Fireworks) chunks into ~30 logical sections (Introduction, Market Size, Competitor A, Q3 Revenue, etc.)

**For each chunk:**
4. **Skip Call 2A/2B** (no Artisan Cut - facts don't compress well)
5. Keep raw text as-is
6. Embedding model generates vector from raw text
7. Save to `file_chunks` with `chunk_type='factual'`, `raw_content` populated

**Later - User Query:**
8. User asks: "What was the market size in 2024?"
9. Embedding model generates vector from query
10. Vector search finds matching chunks (pgvector cosine similarity)
11. **Raw text** of matching chunks injected into Call 1A
12. Call 1A answers: "According to the report: $4.2B in 2024..."

**The Key: No compression. Original text preserved for factual accuracy.**

## Processing Pipeline - Mixed Files

### Complete Flow (Mixed File Example: Expert interview with recommendations + data)

**Upload:**
1. User uploads file via paperclip or drag-and-drop
2. Qwen3-235B (Fireworks) classifies entire file as "mixed"
3. Qwen3-235B (Fireworks) chunks into ~20 logical sections

**For each chunk, Qwen3-235B classifies again:** strategic or factual?

**Strategic chunks (recommendations, advice, strategic thinking):**
4. Call 2A (Qwen3-235B): Initial Artisan Cut compression
5. Call 2B (Qwen3-235B): Compression verification
6. Result: `chunk_essence`, `decision_arc_summary`, `salience_score`
7. Embedding model generates vector from `decision_arc_summary`
8. Save to `file_chunks` with `chunk_type='strategic'`

**Factual chunks (data citations, numbers, research references):**
4. Skip Call 2A/2B (no compression)
5. Keep raw text as-is
6. Embedding model generates vector from raw text
7. Save to `file_chunks` with `chunk_type='factual'`, `raw_content` populated

**Later - Strategic Query:**
8. User asks: "What did the expert recommend about pricing?"
9. Vector search finds strategic chunks
10. **Artisan Cuts** injected into Call 1A
11. Call 1A reasons about strategic advice

**Later - Factual Query:**
8. User asks: "What was the TAM figure mentioned?"
9. Vector search finds factual chunks
10. **Raw text** injected into Call 1A
11. Call 1A answers with exact data

**The Key: Mixed = intelligent routing per chunk, not per file. Same file can have both compressed and raw chunks.**

## Chunking Implementation: Successful Experiment (Jan 2025)

### The Challenge: "Lost in the Middle"

Initial attempts at LLM-based logical chunking revealed a critical limitation: **models stop processing mid-document** even when within context limits. A 65K-character test document (well within Qwen3-235B's 131K extended context) would only chunk the first 22% before stopping.

**Root cause:** LLMs exhibit U-shaped attention patterns - strong recall at beginning/end, blind spot in middle. Even explicit "MUST chunk ENTIRE document" instructions failed. The model was optimizing for "reasonable number of logical chunks" over completeness.

### The Solution: Sliding Window + Per-Window 1A/1B

**Architecture:**
- **Window size:** 20,000 characters
- **Overlap:** 3,000 characters (prevents topic splitting at boundaries)
- **Per window:** Call 1A (initial chunking) → Call 1B (refinement with same context)
- **Then merge:** Deduplicate overlaps, combine all windows

**Key breakthrough:** Explicitly specify character count and require last chunk to reach exact end:
```
CRITICAL RULES:
1. The LAST chunk's "end" value MUST equal {charCount}
2. Chunk by complete ideas and natural topics, NOT by arbitrary character counts
```

**Results on 10,000-word test document:**
- **Coverage:** 95-100% (was 22% before)
- **Chunks:** 26 logical sections (was 57 over-fragmented or 21 incomplete)
- **Quality:** Natural size variation (230-740 words), speaker attribution preserved, excellent titles/summaries
- **Runtime:** ~5.5 minutes for 4 windows × 2 calls each

### Why Per-Window 1A/1B Works

**Fair workload:**
- Call 1A: Process 20K chars → output chunks
- Call 1B: Process same 20K chars + 1A chunks → refine
- Both calls see identical context (no "lost in the middle")

**Unfair alternative (failed):**
- Initial: Process 20K windows → output chunks
- Refinement: Process entire 65K doc + all chunks → refine everything
- Refinement sees more context than initial pass → fails

**Cost efficiency:**
- Qwen3-235B via Fireworks: $0.22/M input, $0.88/M output
- ~8 API calls for 65K document
- Total cost: ~$0.15 per document

### Implementation Notes

**Prompt engineering critical:**
1. Specify exact character count
2. Require last chunk.end === charCount
3. Emphasize natural boundaries over uniform sizing
4. Temperature 0, stop: null (disable early stopping)
5. Aim for 6-10 chunks per window (natural variation)

**Deduplication strategy:**
- Chunks ending in overlap region (last 1,500 chars of window) discarded
- Next window will capture those boundaries with full context
- Sort by position, merge sequentially

**Model behavior:**
- Without constraints: Creates ~5-7 "reasonable" chunks, stops at logical endpoint
- With character count requirement: Processes entire window
- 1B refinement: Improves titles/summaries, adjusts boundaries, merges/splits as needed

### Production Recommendations

**Use sliding window + 1A/1B for:**
- Documents > 15,000 characters
- Any file requiring complete coverage
- Strategic files (interview transcripts, journal entries)

**Use single-pass for:**
- Short documents < 15,000 characters (within reliable processing range)
- Classification tasks (strategic vs factual)

**Model selection:**
- Qwen3-235B-A22B via Fireworks AI confirmed working
- Cost-effective at $0.22/$0.88 per million tokens
- Automatic prompt caching reduces multi-call costs

### Test File Characteristics

**ACD179.md:**
- 10,004 words, 65,509 characters
- Interview transcript: 3 experts, round-robin Q&A format
- 24 speaker turns (BOSS → EXPERT 1 → EXPERT 2 → EXPERT 3 → repeat)
- Perfect for testing logical boundary detection

**Chunking quality metrics:**
- Speaker attribution: Consistent ("BOSS:", "EXPERT 1:")
- Boundary alignment: Natural topic transitions
- Size variation: 230-740 words (not mechanically uniform)
- Completeness: 95%+ coverage, no significant gaps

## Status: All File Types - Fully Designed

This document represents the finalized design for all file handling:
- ✅ Strategic files (Artisan Cut compression)
- ✅ Factual files (RAG with raw text preservation)
- ✅ Mixed files (intelligent per-chunk routing)
- ✅ Chunking implementation validated (sliding window + 1A/1B)
