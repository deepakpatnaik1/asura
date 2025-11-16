# File Processing Flow - Current vs New

## CURRENT FLOW (What Happens Now)

```
USER UPLOADS FILE
    ↓
EXTRACT TEXT FROM FILE (PDF, txt, etc.)
    ↓
CREATE CHUNK 0 (Overview of whole file)
    ↓
SEMANTIC CHUNKING ← THIS IS BROKEN
    - Split file into sentences
    - Generate embedding for EACH sentence
    - Compare embeddings to find "topic shifts"
    - Group sentences into chunks
    - PROBLEM: Creates tiny 1-sentence chunks
    ↓
COMPRESS CHUNKS (Artisan Cut)
    - Chunk 0: Use Call 3A/3B prompts
    - Detail chunks: Use Modified Call 2A/2B prompts
    - PROBLEM: Old prompts talk about "compression"
    - PROBLEM: Tiny chunks = meaningless compression
    ↓
GENERATE EMBEDDINGS
    - Create vector embedding for each compressed chunk
    - Voyage AI API (1024 dimensions)
    ↓
SAVE TO DATABASE
    - All chunks saved to file_chunks table
    - File marked as "ready"
```

## NEW FLOW (What We Want)

```
USER UPLOADS FILE
    ↓
EXTRACT TEXT FROM FILE (PDF, txt, .md, etc.) ← EXPANDED SUPPORT
    ↓
COMBINED OVERVIEW + CHUNKING ← MERGED INTO ONE LLM CALL
    - Send full file to LLM with Call 3A prompt
    - Part 1: Generate file-level overview (max 300 words)
    - Part 2: Divide into logical sub-topic chunks (300-800 words each)
    - LLM returns JSON with overview + chunk boundaries
    - Verify with Call 3B prompt
    - Result: Chunk 0 overview + coherent sub-chapter sized chunks
    ↓
COMPRESS DETAIL CHUNKS (Artisan Cut) ← UPDATED PROMPTS
    - Detail chunks: Use NEW Modified Call 2A/2B prompts
    - New prompts focus on "regenerability" not "compression"
    - New prompts emphasize Rule 1 (preserve non-inferable content)
    - Batch processing: 5 chunks per batch, 5 second delays
    - Progress updates: Every 500ms during delays for debugging
    ↓
GENERATE EMBEDDINGS ← NO CHANGE
    - Create vector embedding for Chunk 0 + all detail chunks
    - Voyage AI API (1024 dimensions)
    ↓
SAVE TO DATABASE ← NO CHANGE
    - All chunks saved to file_chunks table
    - File record saved to files table
    - File marked as "ready"
    ↓
ADD TO CONTEXT SYSTEM ← NEW REQUIREMENT
    - Chunk 0 overview added to context injection bucket
    - Enables persona memory of uploaded files
    - User can reference "that interview transcript I shared"
    - See DATABASE INTEGRATION section below
```

## KEY DIFFERENCES

### What Changes:
1. **Phase 2 (Overview + Chunking):**
   - OLD: Separate calls for overview and semantic chunking (sentence-level embeddings)
   - NEW: Single Call 3A/3B that generates both overview AND logical chunk boundaries
   - Saves 5-8 seconds by combining operations

2. **Phase 3 (Chunk Compression):**
   - OLD: Processes Chunk 0 + detail chunks separately
   - NEW: Chunk 0 already compressed from Call 3A/3B, only detail chunks need Modified Call 2A/2B

3. **Modified Call 2A/2B Prompts:**
   - OLD: Talks about "compression," generic instructions
   - NEW: Three explicit rules, regenerability-focused, no "compression" word

4. **Batch Processing:**
   - OLD: Batches of 10 chunks, no delays
   - NEW: Batches of 5 chunks, 5 second delays (120 RPM vs 600 RPM limit)
   - NEW: Granular progress updates every 500ms during delays

5. **Context Integration:**
   - OLD: Files stored in database only, not in persona memory
   - NEW: Chunk 0 overview added to context injection bucket
   - NEW: Personas can remember "that interview transcript I shared"

### What Stays the Same:
- Text extraction (Phase 1)
- Embedding generation (Voyage AI 1024-dim)
- Database schema (files + file_chunks tables)
- SSE progress updates (now more granular)

## FILES TO MODIFY

### 1. file-chunker.ts
**Function to replace:** `chunkTextBySemantic()`

**Old approach:**
```typescript
function chunkTextBySemantic(text: string) {
  // 1. Split into sentences
  // 2. Generate embedding for each sentence
  // 3. Calculate cosine similarity
  // 4. Create boundaries where similarity drops
  // 5. Group sentences into chunks
  return chunks;
}
```

**New approach:**
```typescript
function chunkTextByLogic(text: string) {
  // 1. Send full text to LLM with FILE_CHUNKING_PROMPT
  // 2. LLM returns JSON with chunk boundaries
  // 3. Extract chunks based on word positions
  return chunks;
}
```

### 2. file-compressor.ts
**What to update:** Prompt constants + Batch processing strategy

**OLD:**
```typescript
const MODIFIED_CALL2A_PROMPT = "...talks about compression...";
const MODIFIED_CALL2B_PROMPT = "...generic verification...";
```

**NEW:**
```typescript
const MODIFIED_CALL2A_PROMPT = "...Rule 1, 2, 3...artisan cut...regenerability...";
const MODIFIED_CALL2B_PROMPT = "...check Rule 1 violations...complete improved output...";
```

**BATCH PROCESSING STRATEGY:**

**Fireworks AI Rate Limits (2025):**
- With payment method: Up to 6,000 RPM (requests per minute)
- Developer Plan: 600 RPM
- Dynamic rate limiting with auto-scaling
- Batch API: No rate limits, 50% lower cost, 24hr turnaround (not suitable for real-time)

**Current Approach:**
- Batches of 10 chunks processed in parallel
- No delays between batches
- Works if total chunks < rate limit

**Recommended Approach:**
- Keep batch size of 10 chunks (20 API calls per batch: 10x Call 2A + 10x Call 2B)
- Add configurable delay between batches (e.g., 1-2 seconds)
- Prevents hitting rate limits on large files
- More predictable latency

**Implementation:**
```typescript
// In batch-processor.ts or file-compressor.ts
// Very conservative settings - background process, correctness > speed
const BATCH_SIZE = 5;  // 5 chunks = 10 API calls per batch
const BATCH_DELAY_MS = 5000; // 5 seconds between batches

// Rate: 10 calls / 5 seconds = 120 RPM (well under any tier limit)
// Process batch 1 → wait 5s → Process batch 2 → wait 5s → etc.

// Example: 30-chunk file = 6 batches × 5s = 30 seconds delay time
// Total processing ~1-2 minutes (acceptable for background job)

// TODO: Make configurable via env variable if needed
// FIREWORKS_BATCH_SIZE=5
// FIREWORKS_BATCH_DELAY_MS=5000
```

### 3. file-processor.ts (maybe)
**Potential changes:**
- Progress phase timings might need adjustment
- Error handling for new chunking approach

## COMPLEXITY RISKS

### What Makes This Hairy:

1. **SSE Progress Updates**
   - Progress percentages tied to 7 phases
   - Frontend expects specific phase transitions
   - If new chunking is faster/slower, progress bar might jump

2. **Batch Processing**
   - Current: Processes 10 chunks at a time
   - New: Might have different number of chunks
   - Should still work, just different batch counts

3. **Error Handling**
   - New LLM call for chunking = new failure point
   - What if LLM returns invalid JSON?
   - What if chunk boundaries don't cover whole file?

4. **Database Schema**
   - Assumes chunk_index 0, 1, 2, 3...
   - Should work fine with new approach
   - Just different chunk sizes

5. **Existing Files**
   - Files already processed with old method
   - Do we migrate? Or just let new uploads use new method?

## IMPLEMENTATION STRATEGY

### Recommended: Direct Replacement

We're on the `file-processing-refactor` branch (isolated from main), so we can safely:
- Delete semantic chunking code entirely
- Replace with logical chunking (Call 3A/3B)
- Update Modified Call 2A/2B prompts
- Implement batch processing with delays
- Test thoroughly before merging to main

**Advantages:**
- Clean implementation, no technical debt
- No feature flags or conditional logic needed
- Easy to review and understand changes
- Branch provides safety net for experimentation

**Rollback Plan:**
- Git reset if changes break
- Don't merge to main until thoroughly tested
- Keep main branch stable

## QUESTIONS TO ANSWER

1. ~~Do we need feature flag or just replace directly?~~ **ANSWERED: Direct replacement, we're on isolated branch**
2. What happens to existing processed files? (They keep working, new uploads use new flow)
3. Should we adjust progress phase percentages? (Yes, see progress tracking section)
4. How do we handle context injection integration? (See DATABASE INTEGRATION section)
5. Should we test with real files before merging? (Yes, PDF + .md + txt at minimum)

## CHUNK 0 OVERVIEW (ALREADY IMPLEMENTED)

**Purpose:** Chunk 0 serves as a file identifier so the model can recognize files from user references.

**Example Use Cases:**
- User: "Hey do you remember the interview transcript I shared with you?"
- User: "Hey do you remember the pitch deck I shared with you?"
- Model should identify which file is being referenced WITHOUT precise metadata

**Implementation:**
- Call 3A/3B prompts already handle Chunk 0 overview generation
- Overview includes:
  - Document type (interview, business plan, email thread, etc.)
  - Participants/authors (names, roles, organizations)
  - Main themes and topics (high-level only)
  - Date/time context (if mentioned)
  - Document purpose/context
  - Overall structure
  - Key entities at document level
- Maximum 300 words for discoverability

**Status:** Already implemented in Call 3A/3B prompts (see docs/⭐️ system-prompts/)

## TESTING CHECKLIST (POST-IMPLEMENTATION)

### File Type Testing:
- [ ] Test PDF upload and processing
- [ ] Test .md (markdown) upload and processing
- [ ] Test .txt upload (baseline)
- [ ] Test code files (.js, .py, etc.)

### Processing Quality:
- [ ] Verify chunks are 300-800 words (not sentence-level)
- [ ] Verify artisan cuts preserve non-inferable content
- [ ] Verify embeddings generate correctly
- [ ] Verify files marked as "ready" with progress 100%

### Edge Cases:
- [ ] Very small files (<300 words)
- [ ] Very large files (>10K words)
- [ ] Files with special characters
- [ ] Error handling for invalid files

## DATABASE INTEGRATION

### Current State:

**Files Table Schema:**
- `files.id` (UUID, primary key)
- `files.user_id` (UUID, references auth.users)
- `files.filename` (TEXT)
- `files.file_type` (enum: pdf, image, text, code, spreadsheet, other)
- `files.content_hash` (TEXT, SHA-256 for deduplication)
- `files.description` (TEXT, Chunk 0 overview)
- `files.embedding` (VECTOR(1024), Voyage AI voyage-3)
- `files.status` (enum: pending, processing, ready, failed)
- `files.processing_stage` (enum: extraction, compression, embedding, finalization)
- `files.progress` (INTEGER, 0-100)
- `files.error_message` (TEXT, nullable)
- `files.uploaded_at` (TIMESTAMPTZ)
- `files.updated_at` (TIMESTAMPTZ)

**File Chunks Table Schema:**
- `file_chunks.id` (UUID, primary key)
- `file_chunks.file_id` (UUID, references files.id ON DELETE CASCADE)
- `file_chunks.user_id` (UUID, denormalized from files)
- `file_chunks.chunk_index` (INTEGER, 0 = overview, 1+ = details)
- `file_chunks.chunk_text` (TEXT, original uncompressed text)
- `file_chunks.description` (TEXT, artisan cut compressed)
- `file_chunks.embedding` (VECTOR(1024), from description)
- `file_chunks.created_at` (TIMESTAMPTZ)

**Journal Table Schema:**
- `journal.id` (UUID, primary key)
- `journal.user_id` (UUID, references auth.users)
- `journal.persona_essence` (TEXT, compressed memory)
- `journal.embedding` (VECTOR(1024), Voyage AI voyage-3)
- `journal.file_name` (TEXT, always NULL - journal is for chat memories only)
- `journal.file_type` (TEXT, always NULL - journal is for chat memories only)
- `journal.created_at` (TIMESTAMPTZ)
- `journal.updated_at` (TIMESTAMPTZ)

**Note:** Journal table stores compressed chat conversation memories, NOT file uploads. Files have their own dedicated table.

### Architecture Notes:

**1. Why Two Tables (files vs file_chunks)?**
- **files table:** High-level file discovery ("find that interview transcript")
- **file_chunks table:** Granular semantic retrieval ("find relevant section about X")
- **Intentional redundancy:** Different access patterns, different query strategies
- **Chunk 0 duplication:** Exists in both `files.description` and `file_chunks[chunk_index=0].description`

### Integration Requirements:

**Goal:** Add file overviews to context injection so personas remember uploaded files.

**Implementation Options:**

**Option A: Context Injection (Recommended)**
- Add files table query to context-builder.ts
- Retrieve file overviews alongside journal/superjournal
- No database schema changes required
- Uses existing embedding system (Voyage AI voyage-3, 1024-dim)
- Implementation location: `src/lib/context-builder.ts` or similar

**Option B: Direct Context Query (Alternative)**
- Query files table directly during each chat request
- Include file overviews in system prompt dynamically
- No pre-processing or caching required
- Simpler implementation, may be slower for large file counts

### Recommended Approach: Option A (Context Injection)

**Why:**
1. No breaking changes to existing schema
2. Uses existing embedding system (no compatibility issues)
3. Files already have dedicated search function (search_file_chunks)
4. Keeps file system cleanly separated
5. Easiest to implement and test

**Implementation Steps:**
1. Update context-builder.ts to query files table
2. Filter for files with status='ready'
3. Include files.description (Chunk 0 overview) in context
4. Order by uploaded_at DESC (most recent first)
5. No limit - return all ready files (cap enforcement out of scope)

**Code Location:**
```typescript
// In src/lib/context-builder.ts (or equivalent)
async function buildContextForPersona(userId: UUID) {
  // Existing: Get superjournal + journal
  const memories = await getMemories(userId);

  // NEW: Get file overviews (all ready files, no limit)
  const fileOverviews = await supabase
    .from('files')
    .select('filename, file_type, description, uploaded_at')
    .eq('user_id', userId)
    .eq('status', 'ready')
    .order('uploaded_at', { ascending: false });
    // No .limit() - return all ready files

  return {
    memories,
    fileOverviews,  // Add to context bucket
  };
}
```

### Testing Requirements:

**Context Injection Testing:**
- [ ] Verify file overviews appear in persona context
- [ ] Test user query: "remember that interview transcript I shared?"
- [ ] Verify persona can identify correct file from vague reference
- [ ] Test with multiple files (ordering, recency)
- [ ] Verify semantic search works with 1024-dim embeddings

**Database Integration Testing:**
- [ ] Verify files.description contains Chunk 0 overview
- [ ] Verify file_chunks[chunk_index=0] matches files.description
- [ ] Test cascade delete (deleting file removes all chunks)
- [ ] Test deduplication (content_hash prevents duplicate uploads)

### Answered Questions:

1. **Should file overviews use semantic search or just recency-based retrieval?**
   - **ANSWER:** Use recency-based retrieval (ORDER BY uploaded_at DESC) for this branch.
   - **NOTE:** Context window caps and semantic search optimization deferred to future branch.

2. **How many file overviews to include in context?**
   - **ANSWER:** All ready files. No limit, no cap enforcement.
   - **NOTE:** 40% context window cap is out of scope for this refactor - too complex, will be tackled separately.

3. **How do we handle very large numbers of uploaded files (100+)?**
   - **ANSWER:** Out of scope for this branch. Testing will use small number of files anyway.

4. **Should we implement pagination for file overview retrieval?**
   - **ANSWER:** No, out of scope. Return all ready files.

5. **Do we need caching for frequently accessed file overviews?**
   - **ANSWER:** Prompt caching already enabled system-wide. No additional file-specific caching needed for this branch.

---

## IMPLEMENTATION CHUNKS

High-level breakdown of work required for this refactor:

### Chunk 1: Update System Prompts in Production
- Copy Modified Call 2A from test-files to docs/⭐️ system-prompts/MODIFIED_CALL_2A_PROMPT.md
- Copy Modified Call 2B from test-files to docs/⭐️ system-prompts/MODIFIED_CALL_2B_PROMPT.md
- Verify Call 3A and Call 3B prompts are already updated with combined overview+chunking logic
- Ensure all prompts use new 3-rule framework (no "compression" terminology)

### Chunk 2: Add New Combined Overview + Chunking Function
- Add Call 3A_PROMPT constant to src/lib/file-chunker.ts (full overview + chunking instructions)
- Add Call 3B_PROMPT constant to src/lib/file-chunker.ts (verification instructions)
- Add new exported function: generateOverviewAndChunks()
  - Makes Call 3A + Call 3B (single pair of LLM calls)
  - Sends full file to LLM with Call 3A prompt
  - Receives JSON with overview + chunk boundaries
  - Verifies with Call 3B prompt
  - Parses JSON response and extracts chunks based on word positions
  - Returns both overview AND chunks for efficient use in file-processor
  - Handles errors (invalid JSON, incomplete chunk coverage, gaps/overlaps)
- Add parseJSON() helper function to handle <think> tags and markdown code blocks
- IMPORTANT: Leave existing functions UNCHANGED (generateFileOverview, chunkTextBySemantic)
- This creates the infrastructure without breaking existing code
- Next chunk will update file-processor.ts to use the new function

### Chunk 3: Update Prompt Constants in file-compressor.ts
- Replace MODIFIED_CALL2A_PROMPT constant with new version from docs/⭐️ system-prompts/
- Replace MODIFIED_CALL2B_PROMPT constant with new version from docs/⭐️ system-prompts/
- Verify prompts are being used correctly in compression flow

### Chunk 4: Implement Batch Processing with Delays
- Update batch processing to use 5 chunks per batch (down from 10)
- Add 5-second delays between batches
- Implement granular progress updates every 500ms during delays
- Ensure SSE updates reflect current batch progress
- Calculate and update progress percentage correctly during delays

### Chunk 5: Update Progress Phase Tracking
- Adjust phase percentages to reflect new flow (6 phases instead of 7)
- Phase 1 (0-10%): Text extraction
- Phase 2 (10-30%): Combined overview + chunking (Call 3A → 3B)
- Phase 3 (30-40%): Compress Chunk 0 (already done by Call 3B, just save)
- Phase 4 (40-70%): Compress detail chunks with batch delays
- Phase 5 (70-90%): Generate embeddings
- Phase 6 (90-100%): Save to database
- Update progress calculation logic in file-processor.ts

### Chunk 6: Add .md File Support
- Verify text extraction supports .md files
- Ensure file type detection correctly identifies markdown files
- Test that .md files process through full pipeline

### Chunk 7: Context Injection Integration
- Update src/lib/context-builder.ts to query files table
- Add query: SELECT filename, file_type, description, uploaded_at FROM files WHERE user_id = ? AND status = 'ready' ORDER BY uploaded_at DESC
- Include file overviews in context bucket returned to chat endpoint
- Format file overviews for inclusion in system prompt
- Ensure file overviews appear alongside superjournal and journal memories

### Chunk 8: Testing and Validation
- Test PDF upload and processing end-to-end
- Test .md upload and processing end-to-end
- Test .txt upload and processing end-to-end
- Verify chunks are 300-800 words (not sentence-level)
- Verify artisan cuts preserve non-inferable content (Rule 1)
- Verify embeddings generate correctly (1024-dim)
- Verify files marked as "ready" with progress 100%
- Test context injection: upload file, then ask "remember that X I shared?"
- Verify persona can identify file from vague reference
- Test edge cases: very small files, very large files, special characters
- Verify error handling for invalid files and failed processing
