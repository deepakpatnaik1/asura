# Integration Megafeatures Branch

## Claude Code Rules

1. **Tight, dense responses** - no verbosity
2. **Document everything** in this file: requirements, implementation, tests, bugs, debugging
3. **Disciplined documentation** - structured, concise
4. **Dense language** - preserve context budget
5. **Bug investigation checklist** - when user reports bugs
6. **Sub-agent workflow** - when authorized for implementation/fixes
7. **No business/UX decisions** - Claude or sub-agents must always ask
8. **Remote Supabase** - not local instance
9. **Single-user app** - no multi-user logic needed

---

## CRITICAL ISSUE: File Retrieval System Failure

**Source:** Test 5 in systemprompts-megafeature (commit 9941147)
**Status:** Architecture fundamentally broken
**Branch origin:** file-megafeature

### The Compound Problem

File retrieval fails at MULTIPLE levels - not one bug, but cascading failures:

1. **Chunks too small** - Single sentences (e.g., "Asserts the space is defined, not owned.")
2. **No context** - Chunks meaningless in isolation
3. **Compression too aggressive** - Artisan Cut removes critical info
4. **No size enforcement** - Zero minimum chunk size
5. **Vector search returns 0** - search_file_chunks broken/misconfigured
6. **AI hallucinates** - Claims "security reasons" instead of "no results found"

### The Hairy Interconnections

**Problem A affects Problem B:**
- Small chunks → aggressive compression → meaningless fragments
- Meaningless fragments → vector search finds nothing useful
- Vector search failure → AI gets no context → hallucinates excuses
- Even if vector search worked, chunks too small to be useful

**Can't fix in isolation:**
- Fixing vector search alone won't help (chunks still useless)
- Fixing chunk size alone won't help (search still broken)
- Fixing compression alone won't help (chunks still too small)
- Must fix ALL layers simultaneously

### Current State Analysis Needed

**Before fixing, must understand:**
1. How semantic chunking currently works (file-chunker.ts)
2. How Artisan Cut compression works (file-compressor.ts)
3. How vector search works (search_file_chunks function)
4. What's in database right now (actual chunk examples)
5. What query embeddings are being generated
6. Why search returns 0 results (threshold? function? query?)

### Investigation Required

---

## PROPOSAL: Radically Simplify File Processing

**User insight:** Model has 131K token context (≈98K words). Testing with 10K word file. Why chunk at all?

### Plan A: Whole File Artisan Cut (files <50K words)

**Approach:**
1. Extract full file text
2. Send entire file to model with prompt: "Create artisan cut of this file"
3. Model returns compressed JSON
4. Save as single chunk with embedding
5. Done

**Advantages:**
- Model sees full context - no information loss
- No semantic boundary detection needed
- No tiny meaningless chunks
- Model decides what's important holistically
- Simpler code, fewer failure points

**When it fails:** File >50K words exceeds practical context budget

### Plan B: Model-Directed Chunking (files >50K words)

**Approach:**
1. Extract full file text
2. Send to model: "This file is too large. Break it into 3-5 logical sections with clear topic boundaries"
3. Model returns section boundaries (line numbers or headings)
4. We chunk according to model's directions
5. Each chunk gets artisan cut + embedding
6. Chunk 0 still exists as file overview

**Advantages:**
- Model understands content structure (not embedding similarity heuristics)
- Chunks have logical coherence (chapters, sections, topics)
- Minimum size naturally enforced (model won't create sentence-level chunks)
- Context preserved within each chunk

### Current System vs. Proposed

**Current (broken):**
- Embedding similarity → tiny sentence chunks
- Artisan Cut on fragments → meaningless compression
- Vector search finds nothing useful

**Proposed Plan A:**
- Whole file → single artisan cut → one useful embedding
- Works for 99% of use cases (most files <50K words)

**Proposed Plan B (rare large files):**
- Model sees whole file → creates logical sections → we chunk on boundaries
- Preserves semantic coherence

### Questions for User

1. Should we try Plan A first (whole file processing)?
2. What file size threshold triggers Plan B? (suggest 50K words)
3. Keep Chunk 0 overview pattern for both plans?

---

## REFACTORING STRATEGY: Delete Broken Code, Write Simple Replacement

**User insight:** Old code proven broken. Why keep it?

### Revised Approach: Delete Then Build

**Phase 1: Nuke Broken Chunking**
1. Delete file-chunker.ts entirely
2. Delete semantic chunking logic from file-processor.ts
3. Gut file-compressor.ts to bare minimum

**Phase 2: Build Simple Replacement**
1. Write `processWholeFile()` - single function, whole file artisan cut
2. Wire into file-processor.ts
3. Test with 10K word file

**Phase 3: If Broken, Fix Forward (Not Rollback)**
- No rollback to broken code
- Old code is garbage - documented in Test 5
- Either new approach works or we fix it until it does

### Why This Works Better

**Cleaner:**
- No feature flags
- No maintaining two broken systems
- Simpler mental model

**Honest:**
- Old code doesn't work (Test 5 proof)
- Keeping it gives false sense of safety
- Git history preserves it if desperate

**Faster:**
- Write 50 lines instead of 60+ with conditionals
- Delete 300+ lines immediately
- Net: -250 lines, simpler codebase

### Implementation Plan - REVISED (Go Slow)

**Phase 1: Understand Current Architecture (NO CHANGES)**
- Step 1: Read file-processor.ts - understand full flow
- Step 2: Read file-chunker.ts - understand semantic chunking
- Step 3: Read file-compressor.ts - understand compression calls
- Step 4: Understand progress bar system (0-100% phases)
- Step 5: Map out all dependencies (what calls what, when)
- Step 6: Identify Modified Call 2A/2B usage
- Step 7: Document current architecture in this file

**Phase 2: Design New Architecture (NO CODE)**
- Step 8: Design whole-file flow
- Step 9: Map new flow to progress bar phases
- Step 10: Identify what stays, what goes
- Step 11: Plan backward compatibility (database, APIs)
- Step 12: Get user approval on design

**Phase 3: Implement (ONLY AFTER APPROVAL)**
- Step 13: Delete old code
- Step 14: Write new code
- Step 15: Test

Current status: Phase 1, Step 1-3 complete

---

## CURRENT ARCHITECTURE ANALYSIS

### File Processing Pipeline (7 Phases)

**Phase 1: Extraction (0-10%)**
- Extract text from file buffer
- Generate content hash
- Check duplicates
- Create DB record (status='pending')
- Source: file-extraction.ts

**Phase 2: Generate Chunk 0 Overview (10-20%)**
- Small files (≤2000 words): Heuristic (first 1000 words)
- Large files (>2000 words): LLM (first 2000 + last 500 words)
- Source: file-chunker.ts → generateFileOverview()

**Phase 3: Semantic Chunking (20-30%)**
- Target: 768 tokens per chunk
- Similarity threshold: 0.5 (cosine similarity between embeddings)
- Min chunk: 256 tokens, Max chunk: 1024 tokens
- Source: file-chunker.ts → chunkTextBySemantic()
- **PROBLEM: Creates tiny single-sentence chunks**

**Phase 4: Compress Chunk 0 (30-40%)**
- Uses CALL3A_PROMPT + CALL3B_PROMPT
- Model: Read from user_settings
- reasoning_effort: "none"
- Source: file-compressor.ts → compressChunk(chunkIndex=0)

**Phase 5: Compress Detail Chunks (40-70%)**
- Uses MODIFIED_CALL2A_PROMPT + MODIFIED_CALL2B_PROMPT
- Batched parallelization (10 chunks at a time)
- Granular progress updates (40% → 70%)
- Source: file-compressor.ts → compressChunk(chunkIndex=1+)
- **PROBLEM: Artisan Cut too aggressive on tiny chunks**

**Phase 6: Generate Embeddings (70-90%)**
- Voyage AI (voyage-3-large, 1024 dimensions)
- Batched parallelization (10 embeddings at a time)
- Granular progress updates (70% → 90%)
- Source: vectorization.ts → generateEmbedding()

**Phase 7: Save to Database (90-100%)**
- Insert all chunks into file_chunks table
- Update files table (status='ready')
- Source: file-processor.ts → saveAllChunksToDatabase()

### Key Dependencies

**file-processor.ts imports:**
- extractText, validateFileSize from file-extraction.ts
- generateFileOverview, chunkTextBySemantic from file-chunker.ts
- compressChunk from file-compressor.ts
- generateEmbedding from vectorization.ts
- processBatched from batch-processor.ts

**file-compressor.ts imports:**
- MODIFIED_CALL2A_PROMPT, MODIFIED_CALL2B_PROMPT, CALL3A_PROMPT, CALL3B_PROMPT from prompts/

**Compression Flow (A-B Pattern):**
1. Chunk 0: CALL3A → CALL3B (overview compression)
2. Chunk 1+: MODIFIED_CALL2A → MODIFIED_CALL2B (detail compression)

### Progress Bar Phases

```
0-10%   Extraction
10-20%  Chunk 0 overview generation
20-30%  Semantic chunking
30-40%  Chunk 0 compression
40-70%  Detail chunk compression (granular)
70-90%  Embedding generation (granular)
90-100% Database save
```

**Progress stuck issue:** Phase 5 (40-70%) blocks during parallel compression, then jumps to 90%.

### Database Schema

**files table:**
- status: 'pending' | 'processing' | 'ready' | 'failed'
- progress: 0-100
- processing_stage: extraction | chunking | compression | embedding | finalization | completed
- description: Chunk 0 compressed description

**file_chunks table:**
- file_id, chunk_index
- chunk_text: Original text (NOT compressed)
- description: Compressed Artisan Cut
- embedding: vector(1024)

### What Breaks in Current System

**Semantic chunking (Phase 3):**
- Embeddings generated for EVERY sentence
- Cosine similarity detects "topic shifts" between sentences
- Creates chunks as small as 1 sentence (documented: "Asserts the space is defined, not owned.")
- No minimum word count enforcement (only token count: 256-1024)

**Artisan Cut compression (Phase 5):**
- MODIFIED_CALL2A tries to compress 1-sentence chunks
- No context to preserve
- Results in meaningless fragments

**Vector search (not in this file):**
- search_file_chunks function returns 0 results
- Possible causes: threshold too high, function broken, embeddings mismatched

---

## WHY THIS IS MESSY (Not Simple Delete)

### Interconnected Components

**Can't just delete file-chunker.ts because:**
1. generateFileOverview() used in Phase 2 (10-20%)
2. chunkTextBySemantic() used in Phase 3 (20-30%)
3. Progress bar depends on these phases existing
4. Frontend expects 7-phase progress updates
5. Database schema expects chunk_index (0, 1, 2, 3...)

**Can't just gut file-compressor.ts because:**
1. compressChunk() called for BOTH Chunk 0 AND detail chunks
2. Uses different prompts based on chunkIndex (0 vs 1+)
3. Returns ChunkCompressionResult with specific structure
4. file-processor.ts expects this exact interface
5. A-B pattern (Call 3A/3B, Modified Call 2A/2B) baked in

**Can't just simplify file-processor.ts because:**
1. Seven hardcoded progress phases
2. Error handling for each phase
3. Batched parallelization for Phases 5 & 6
4. Progress callbacks to frontend
5. Database updates at each phase boundary
6. Retry logic for failures
7. SSE events expected by frontend

### What ACTUALLY Needs to Change

**Option 1: Minimal Surgery (Keep Structure)**
- Keep 7 phases
- Replace Phase 3 semantic chunking with "whole file = 1 chunk"
- Adjust Phase 5 to handle single chunk (10-20% instead of 40-70%)
- Keep all progress bar infrastructure
- Keep database schema (chunk_index=0 for whole file)
- **Advantage:** Minimal changes, progress bar still works
- **Disadvantage:** Keeping dead infrastructure

**Option 2: Radical Simplification (New Structure)**
- Reduce to 4 phases: Extract (0-25%), Compress (25-50%), Embed (50-75%), Save (75-100%)
- Delete generateFileOverview() - no Chunk 0 concept
- Delete chunkTextBySemantic() - no chunking
- Single compression call for whole file
- Single embedding for whole file
- **Advantage:** Clean, simple, matches new approach
- **Disadvantage:** Breaks progress bar, breaks database schema expectations, massive refactor

### The Real Questions

1. **Keep Chunk 0 overview concept?** Or just compress whole file as single entity?
2. **Keep 7-phase progress?** Or simplify to 4 phases?
3. **Keep file_chunks.chunk_index?** Or assume always 0?
4. **Keep Modified Call 2A/2B prompts?** Or create new "whole file" prompt?
5. **Backward compatibility?** Existing uploaded files have multiple chunks - do we migrate?

### My Recommendation

**Hybrid approach:**
1. Keep extraction (Phase 1)
2. Keep Chunk 0 overview generation (Phase 2) - still useful for large files
3. **REPLACE Phase 3:** Instead of semantic chunking, just return fullText as single chunk
4. Keep Chunk 0 compression (Phase 4)
5. **SIMPLIFY Phase 5:** Compress whole file as chunk_index=1 (not 1, 2, 3...)
6. Keep embeddings (Phase 6) - now just 2 embeddings (Chunk 0 + whole file)
7. Keep save (Phase 7)

**Result:**
- Chunk 0 = overview for discoverability
- Chunk 1 = whole file compressed
- 2 embeddings total
- Progress bar still works (7 phases)
- Minimal code changes
- Database schema unchanged

Does this make sense? Or do you want full radical simplification?

---

## USER DECISION: Test First, Then Decide

**Approach:** Build isolated test page before refactoring production system

### Test Page Spec

**Route:** `/test-whole-file`

**UI:**
- File upload button (accept 10K word test file)
- Display window showing:
  - Original file length (word count)
  - Artisan Cut result (compressed description)
  - Embedding generated (first 10 dimensions for verification)
  - Time taken

**Backend:**
- New API route: `/api/test-whole-file`
- Read entire file text
- Send to model with whole-file compression prompt
- Return compressed result
- No database writes

**Purpose:**
- Verify model can handle 10K words in one call
- See quality of compression on full context
- Measure time/cost
- If works: proceed with refactor
- If fails: rethink approach

### Implementation Steps

1. Create test page route: `src/routes/test-whole-file/+page.svelte`
2. Create test API: `src/routes/api/test-whole-file/+server.ts`
3. Reuse: file-extraction.ts (extractText), vectorization.ts (generateEmbedding)
4. New: Single compression function (no A-B calls for test)
5. Test with 10K word file
6. Review results with user

**Estimated effort:** 100-150 lines, ~30 min

Ready to build test page?

---

## IMPLEMENTATION: Test Page Built

**Files created:**
- `src/routes/test/+page.svelte` (UI)
- `src/routes/api/test-whole-file/+server.ts` (API)

**Test URL:** http://localhost:5173/test

**Features:**
- Upload button (accepts .txt, .md, .pdf)
- Displays: word count, compressed description, embedding preview, processing time
- Uses selected model from user_settings
- No database writes (isolated test)

**Next:** User tests with 10K word file, reviews compression quality

---

## TEST RESULTS: Whole File Compression SUCCESS

**Test file:** 9,634 words (AI compliance market analysis)
**Processing time:** 29,350ms (~30 seconds)
**Compressed output:** ~1,100 words (88% compression ratio)

### Compression Quality Assessment

**Strengths:**
- Captured main themes (compliance market, competitive landscape, wedge strategies)
- Preserved key strategic insights (3 wedges, technology stack, go-to-market)
- Maintained narrative structure and logical flow
- Identified buyer personas and psychological dynamics
- Extracted tactical recommendations for founders

**Observation:** Compression is comprehensive, preserving strategic value while reducing verbosity. No information loss on core concepts.

**Embedding generated:** 1024 dimensions, preview shows valid float values

### User Decision Required

Test proves whole-file approach **WORKS** for 10K word files.

**Next steps:**
1. Refactor production system to use whole-file compression?
2. Keep hybrid approach (Chunk 0 overview + Chunk 1 whole file)?
3. Or radical simplification (single chunk, no overview)?

---

## TEST CORRECTION: Using Real Artisan Cut Prompt

**User feedback:** First test used generic summarization prompt, not Modified Call 2A artisan cut prompt.

**Changes made:**
- Replaced test prompt with exact MODIFIED_CALL2A_PROMPT from production
- Added JSON parsing (prompt expects JSON output)
- Will test if model can perform complex artisan cut on 10K word file

**Ready for retest:** Upload same file to http://localhost:5174/test
