# File Uploads Mega Feature - Project Brief

## Status: Requirements & Business Logic Discussion Phase
**Branch**: file-megafeature
**Started**: 2025-11-11
**Boss & Claude**

---

## Previous Work Reference
This feature was previously implemented in the `file-feature-planning` branch with comprehensive planning and implementation. We are now redoing this feature with more rigorous business logic review and the new subagent workflow.

**Reference Documents** (brought over from old branch):
- `docs/file-uploads-dependency-graph.md` - 7-layer technical specification
- `docs/effective-planning-and-dependency-graphs.md` - Planning methodology
- `docs/bug-investigation-protocol.md` - Debug process
- `docs/supabase-infrastructure-decision.md` - Infrastructure decisions

---

## Business Logic Discussion

### Open Questions for Boss

1. **Who sees uploaded files?**
   - Should files be private per user (requires auth)?
   - Or shared across all users (simpler MVP)?
   - Previous implementation: shared across all users

2. **What happens to uploaded content?**
   - Strategic content gets compressed (essence + salience)
   - Factual content stored verbatim
   - Does this align with how you want users to think about file uploads?

3. **When does uploaded content appear in conversations?**
   - Immediately available after upload completes?
   - Always injected into context, or only when semantically relevant?

4. **File classification decision:**
   - AI classifies files as strategic/factual/mixed
   - Should users be able to override this classification?
   - Should users even see this classification, or is it purely backend logic?

5. **What's the user mental model?**
   - "I upload a document and the AI remembers it" (simple)
   - "I upload documents to build a knowledge base I can query" (more explicit)
   - Something else?

### Boss's Answers

**1. Who sees uploaded files?**
- Files are private per user (once Google Auth is implemented)
- Current shared state is only due to lack of auth implementation
- **Decision:** Design for private-per-user from the start, even if auth doesn't exist yet

**2. What happens to uploaded content?**
- **ALL files get Artisan Cut treatment** (Modified Call 2A/2B from system-prompts.md)
- Artisan Cut preserves exact numbers, dates, specific data (cannot be inferred from fewer words)
- Compresses verbose prose, removes noise, condenses inferable content
- No strategic/factual classification distinction
- **Decision:** Single processing path for all files - Artisan Cut compression

**3. When does uploaded content appear in conversations?**
- File descriptions loaded into context as part of context injection bundle
- Subject to 40% context budget cap
- Remains in context until user manually deletes the file
- **Decision:** Permanent presence in context (within budget limits) until manual deletion

**4. File classification decision:**
- **No classification** (removed from design)
- No strategic/factual/mixed distinction
- All files treated identically
- **Decision:** Eliminated complexity - single processing pipeline

**5. User mental model:**
- "I upload important documents and Asura remembers them forever (until I delete them)"
- Files are part of Asura's permanent memory system
- User has manual control via delete
- **Decision:** Simple, permanent memory model with manual deletion

**6. Ephemeral files (screenshots, translations, temp images):**
- **Deferred to future phase** - product discipline over feature permutations
- For MVP: All files treated as important/permanent
- Future: May add ephemeral file handling (direct to LLM, no storage, no Call 2)
- **Decision:** Out of scope for this mega feature

---

## Requirements

### Core Feature Goal
Enable users to upload documents (PDF, TXT, MD, images, code, spreadsheets) that become part of Asura's permanent memory system, compressed via Artisan Cut and retrievable through semantic search.

### Functional Requirements

**FR1: File Upload**
- Accept file types: PDF, TXT, MD, PNG, JPG, GIF, WebP, JS, TS, PY, XLSX, CSV, JSON, other common formats
- File size limit: 10MB
- User uploads via UI button/input
- Immediate feedback on upload success/failure

**FR2: File Processing**
- Extract text/content from uploaded file
- Apply Modified Call 2A/2B Artisan Cut compression (from system-prompts.md lines 305-448)
- Generate 1024-dim embedding from compressed description (Voyage AI voyage-3)
- Store file metadata + compressed description + embedding in database
- All-or-nothing processing: complete success or clear failure (no partial data)

**FR3: Progress Tracking**
- Real-time progress updates (0-100%) with stage indicators
- Stages: extraction, compression, embedding, finalization
- Display progress in UI (progress bar + stage text)
- Error messages on failure with clear description

**FR4: File Management**
- List all uploaded files in dropdown UI
- Show status: pending, processing, ready, failed
- Manual deletion by user
- Cascade delete (file + all associated data)

**FR5: Context Injection**
- File descriptions loaded into Call 1A/1B context
- Subject to 40% context budget cap
- Priority TBD (likely Priority 6 after vector search results)
- Persistent until manual deletion

**FR6: Deduplication**
- Content-hash based duplicate detection (SHA-256)
- Prevent re-uploading identical files
- User feedback: "This file already exists"

**FR7: User Isolation**
- Files scoped to `user_id`
- User only sees their own files
- Design for multi-user even if auth not yet implemented

### Non-Functional Requirements

**NFR1: Performance**
- Processing completes within reasonable time (target: <2min for 10MB file)
- Non-blocking UI (fire-and-forget processing)
- Real-time progress updates via Server-Sent Events (SSE)

**NFR2: Data Integrity**
- All-or-nothing transaction pattern
- No partial file data in database on failure
- Clear error states and recovery

**NFR3: Cost Optimization**
- Use Qwen 2.5 235B via Fireworks for Modified Call 2A/2B
- Use Voyage AI voyage-3 for embeddings (1024-dim, $0.06/M tokens)
- Leverage automatic prompt caching where possible

**NFR4: Quality**
- Artisan Cut compression preserves all non-inferable information
- Exact numbers, dates, entities, decisions preserved
- Two-step compression verification (Call 2A → Call 2B)

### Out of Scope (Future Phases)

- Ephemeral file handling (screenshots, temp images, translations)
- User-controlled classification override
- File preview/viewer in UI
- Batch upload
- File search/filtering UI (beyond dropdown list)
- File versioning
- File sharing between users
- Auto-expiration based on N turns or time

---

## High-Level Chunks (10)

### Architecture Simplification vs Old Implementation

**Old design had:**
- File classification (strategic/factual/mixed)
- Intelligent chunking with sliding window algorithm
- Per-chunk classification
- Dual-track processing (strategic compression vs factual preservation)
- file_chunks table with multiple chunks per file

**New simplified design:**
- Single processing path for ALL files
- No classification, no chunking
- Files processed as whole units
- Modified Call 2A/2B for everything
- Single files table (no chunks)

### Chunk Breakdown

**Chunk 1: Database Schema**
- Create `files` table with fields:
  - `id`, `user_id`, `filename`, `file_type` (pdf|image|text|code|spreadsheet|other)
  - `content_hash` (SHA-256 for deduplication)
  - `description` (Artisan Cut compressed text)
  - `embedding` (VECTOR(1024))
  - `status` (pending|processing|ready|failed)
  - `processing_stage` (extraction|compression|embedding|finalization)
  - `progress` (0-100)
  - `error_message` (nullable)
  - `uploaded_at`, `updated_at`
- Indexes: user_id, content_hash, status
- Enable Row Level Security (RLS) for user isolation
- Migration script for Supabase

**Chunk 2: File Extraction**
- Library: `src/lib/file-extraction.ts`
- Extract text from PDF (via unpdf), images, text files, code, spreadsheets
- Validate file size (10MB limit)
- Generate content hash (SHA-256) for deduplication
- Return extraction result with metadata (word count, char count, etc.)
- Error handling with FileExtractionError class

**Chunk 3: Voyage AI Integration**
- Library: `src/lib/vectorization.ts`
- Generate 1024-dim embeddings via Voyage AI voyage-3 model
- Input: Artisan Cut compressed description
- Output: embedding vector
- Cost optimization: $0.06/M tokens
- Error handling with VectorizationError class
- Requires VOYAGE_API_KEY in .env

**Chunk 4: Modified Call 2 Integration**
- Library: `src/lib/file-compressor.ts`
- Call 2A: Apply Modified Call 2A prompt (from system-prompts.md lines 305-448)
- Input: extracted file content + filename + file_type
- Output: JSON with { filename, file_type, description }
- Call 2B: Verification and refinement
- Uses Fireworks AI (Qwen 2.5 235B)
- Artisan Cut compression preserves non-inferable information
- Error handling with FileCompressionError class

**Chunk 5: File Processor Orchestration**
- Library: `src/lib/file-processor.ts`
- End-to-end pipeline:
  1. Extract text (update progress: 0-25%)
  2. Compress via Modified Call 2A/2B (update progress: 25-75%)
  3. Generate embedding (update progress: 75-90%)
  4. Save to database (update progress: 90-100%)
- Progress tracking with stage updates
- All-or-nothing transaction pattern
- Error handling: mark file as failed, save error_message
- Update database in real-time for SSE consumption

**Chunk 6: API Endpoints**
- **Upload API**: `src/routes/api/files/upload/+server.ts`
  - POST /api/files/upload
  - Accept FormData with file
  - Validate file type and size
  - Check for duplicates (content_hash)
  - Create database record (status: pending)
  - Fire-and-forget: trigger file processor in background
  - Return file_id immediately

- **List API**: `src/routes/api/files/+server.ts`
  - GET /api/files
  - Return all files for current user
  - Filter by status (optional query param)
  - Include progress, stage, error_message

- **Delete API**: `src/routes/api/files/[id]/+server.ts`
  - DELETE /api/files/:id
  - Verify user_id matches (authorization)
  - Delete file record (database handles cleanup)
  - Return success/failure

**Chunk 7: Server-Sent Events (SSE)**
- Endpoint: `src/routes/api/files/events/+server.ts`
- GET /api/files/events (SSE stream)
- Subscribe to Supabase Realtime on `files` table
- Filter by user_id
- Push events: file-update, file-deleted
- Heartbeat every 30s to keep connection alive
- Graceful error handling and cleanup

**Chunk 8: Files Store (Frontend State)**
- Store: `src/lib/stores/files.ts`
- Svelte writable store for file list
- Derived stores:
  - `processingFiles` (status: processing)
  - `readyFiles` (status: ready)
  - `failedFiles` (status: failed)
- Actions:
  - `uploadFile(file: File)` → calls Upload API
  - `deleteFile(id: string)` → calls Delete API
  - `refreshFiles()` → calls List API
- SSE connection management:
  - Connect on mount
  - Update store on events
  - Disconnect on unmount

**Chunk 9: UI Integration**
- Component: `src/routes/+page.svelte` (chat interface)
- **File upload button:**
  - Hidden file input element
  - Paperclip icon button to trigger file picker
  - Wire to `uploadFile()` action from files store

- **File dropdown:**
  - List all files with status indicators
  - Show progress bars for processing files
  - Show error messages for failed files
  - Delete button per file (with confirmation)

- **SSE lifecycle:**
  - Connect to SSE on component mount
  - Update UI in real-time as files process
  - Show "connection lost" indicator if SSE drops
  - Disconnect on unmount

**Chunk 10: Context Injection Integration**
- Library: `src/lib/context-builder.ts` (existing file)
- Add new priority tier (Priority 6):
  - Load file descriptions where status = 'ready'
  - Filter by user_id
  - Format: "File: [filename]\n[description]\n\n"
  - Load as many as fit within 40% context budget
  - Exclude files already used in earlier priorities (deduplication)
- Integrate into buildContext() function
- Pass to Call 1A and Call 1B

---

## Implementation Progress

### Status: Implementation Complete, Testing Phase

**Completed Implementation Chunks:**
- ✅ Chunk 1: Database Schema
- ✅ Chunk 2: File Extraction
- ✅ Chunk 3: Voyage AI Integration
- ✅ Chunk 4: Modified Call 2 Integration
- ✅ Chunk 5: File Processor Orchestration
- ✅ Chunk 6: API Endpoints
- ✅ Chunk 7: Server-Sent Events
- ✅ Chunk 8: Files Store
- ✅ Chunk 9: UI Integration
- ✅ Chunk 10: Context Injection Integration

**Testing Chunks:**
1. ✅ T1: Unit Tests (COMPLETE - 100+ tests)
2. ✅ T2: Database Tests (COMPLETE - 50+ tests)
3. ✅ T3: API Integration Tests (COMPLETE - 75+ tests)
4. ✅ T4: SSE/Store Integration Tests (COMPLETE - 90+ tests)
5. ✅ T5: End-to-End Tests (COMPLETE - 42 tests)
6. ✅ T6: Regression Tests (COMPLETE - 29 tests)

**Testing Phase: COMPLETE** ✅
**Grand Total: 386+ tests passing**

**Next Steps:**
- All testing complete (T1-T6)
- Feature ready for Boss acceptance testing
- Ready for deployment to production

---

## Testing Chunks (T1-T6)

### T1: Unit Tests
Test all library functions in isolation without external dependencies.

**Scope:**
- `src/lib/file-extraction.ts`
  - Test extractText() for each file type (PDF, text, code, spreadsheet, images)
  - Test file size validation (reject >10MB)
  - Test generateContentHash() produces SHA-256 hashes
  - Test error handling (FileExtractionError with proper codes)
  - Mock file buffers for each format

- `src/lib/vectorization.ts`
  - Test generateEmbedding() returns 1024-dim array
  - Test error handling (VectorizationError with proper codes)
  - Mock Voyage AI API responses
  - Test rate limiting/retry logic

- `src/lib/file-compressor.ts`
  - Test compressFile() Call 2A/2B flow
  - Test JSON parsing from LLM responses
  - Test error handling (FileCompressionError with proper codes)
  - Mock Fireworks API responses
  - Test Artisan Cut preservation (numbers, dates, entities)

- `src/lib/file-processor.ts`
  - Test processFile() orchestration flow
  - Test progress tracking (0-100%)
  - Test stage transitions (extraction → compression → embedding → finalization)
  - Test duplicate detection logic
  - Test error handling and rollback
  - Test retry logic with exponential backoff
  - Mock all external dependencies (extraction, compression, embedding, DB)

**Test Framework:**
- Vitest for unit tests
- Mock all API calls (Voyage AI, Fireworks)
- Mock Supabase client
- Test files: `src/lib/__tests__/file-extraction.test.ts`, etc.

**Success Criteria:**
- 100% code coverage for all library functions
- All edge cases covered (empty files, invalid formats, API failures)
- All error paths tested
- All mocks properly isolated

### T2: Database Tests
Test database schema, migrations, queries, and data integrity.

**Scope:**
- Migration validity
  - Test `20251111120100_create_files_table.sql` applies cleanly
  - Test all indexes created correctly
  - Test RLS policies defined (even if disabled)
  - Test enum types created
  - Test rollback works

- CRUD operations
  - Test INSERT into files table
  - Test SELECT with user_id filtering
  - Test UPDATE status/progress/stage
  - Test DELETE cascade behavior
  - Test duplicate detection via content_hash unique index

- Vector operations
  - Test embedding column stores 1024-dim vectors
  - Test HNSW index works for cosine similarity
  - Test vector search queries

- Data integrity
  - Test NOT NULL constraints
  - Test DEFAULT values
  - Test TIMESTAMPTZ auto-updates
  - Test foreign key behavior (if any)

**Test Framework:**
- Direct Supabase queries via psql or Supabase client
- Test database: use `npx supabase db reset` for clean state
- Test files: `tests/database/files-table.test.ts`

**Success Criteria:**
- All migrations apply without errors
- All constraints enforced correctly
- All indexes used by query planner
- Vector search returns expected results

### T3: API Integration Tests
Test all API endpoints end-to-end with real database.

**Scope:**
- Upload API (`POST /api/files/upload`)
  - Test successful upload (returns 202 + file_id)
  - Test file type validation (reject unsupported types)
  - Test file size validation (reject >10MB)
  - Test duplicate detection (reject same content_hash)
  - Test missing file (400 error)
  - Test FormData parsing
  - Test fire-and-forget (returns before processing completes)

- List API (`GET /api/files`)
  - Test returns all files for user
  - Test status filtering (?status=ready)
  - Test includes progress, stage, error_message
  - Test empty list for new user
  - Test user isolation (doesn't show other users' files)

- Get API (`GET /api/files/[id]`)
  - Test returns file details
  - Test 404 for non-existent file
  - Test 403 for other user's file

- Delete API (`DELETE /api/files/[id]`)
  - Test successful deletion
  - Test 404 for non-existent file
  - Test 403 for other user's file
  - Test cascade deletion (verify DB record gone)

**Test Framework:**
- Use SvelteKit's testing utilities or raw fetch()
- Real database (reset before each test)
- Mock processFile() to avoid LLM calls
- Test files: `tests/api/files.test.ts`

**Success Criteria:**
- All endpoints return correct status codes
- All validation logic works
- All error messages are descriptive
- User isolation enforced
- No data leaks between users

### T4: SSE/Store Integration Tests
Test real-time updates, SSE connection, and frontend state management.

**Scope:**
- SSE Endpoint (`GET /api/files/events`)
  - Test SSE stream establishes
  - Test user_id filtering in Supabase Realtime
  - Test file-update events pushed on INSERT/UPDATE
  - Test file-deleted events pushed on DELETE
  - Test heartbeat every 30s
  - Test connection cleanup on client disconnect
  - Test reconnection after network failure

- Files Store (`src/lib/stores/filesStore.ts`)
  - Test uploadFile() calls Upload API
  - Test deleteFile() calls Delete API
  - Test refreshFiles() calls List API
  - Test SSE auto-connect on first subscriber
  - Test SSE auto-disconnect when no subscribers
  - Test store updates on SSE events
  - Test derived stores (processingFiles, readyFiles, failedFiles)
  - Test exponential backoff reconnection
  - Test error state management

**Test Framework:**
- Mock EventSource or use real SSE connection
- Mock Supabase Realtime
- Test files: `tests/stores/filesStore.test.ts`

**Success Criteria:**
- Store reflects real-time database changes
- SSE connection lifecycle managed correctly
- No memory leaks from unclosed connections
- Derived stores computed correctly
- Reconnection logic works

### T5: End-to-End Tests
Test complete user flows from UI to database and back.

**Scope:**
- Complete upload flow
  1. User selects file via file picker
  2. Upload API returns 202
  3. File appears in UI with "processing" status
  4. Progress bar updates in real-time (via SSE)
  5. File transitions to "ready" when complete
  6. File description appears in context injection

- Delete flow
  1. User clicks delete button
  2. Confirmation modal appears
  3. User confirms deletion
  4. File removed from UI
  5. File removed from database

- Error flow
  1. User uploads unsupported file
  2. Error message shown immediately
  3. User uploads file that fails processing
  4. File shows "failed" status with error message

- Drag-and-drop flow
  1. User drags file over drop zone
  2. Drop zone highlights
  3. User drops file
  4. Upload proceeds as normal

- Context injection verification
  1. Upload file
  2. Wait for "ready" status
  3. Send message to chat
  4. Verify file description in Call 1A context

**Test Framework:**
- Playwright or similar E2E framework
- Real browser, real UI
- Real database (reset before each test)
- Mock LLM APIs (Fireworks, Voyage) to avoid cost
- Test files: `tests/e2e/file-uploads.spec.ts`

**Success Criteria:**
- All user flows work end-to-end
- UI updates in real-time
- No race conditions or timing bugs
- Error states handled gracefully
- Context injection works correctly

### T6: Regression Tests
Test that existing features still work after file uploads integration.

**Scope:**
- Chat functionality
  - Test sending messages still works
  - Test Call 1A → 1B flow
  - Test Call 2A → 2B for journal entries
  - Test context injection still works for existing priorities

- Journal functionality
  - Test journal entries still created
  - Test journal search still works
  - Test journal embeddings still generated

- Context budget
  - Test 40% cap still enforced
  - Test files don't break greedy token packing
  - Test Priority 6 (files) doesn't interfere with Priorities 1-5

- Performance
  - Test no significant slowdown in chat response time
  - Test no memory leaks from SSE connections
  - Test no database query regressions

**Test Framework:**
- Mix of unit tests and E2E tests
- Compare before/after metrics
- Test files: `tests/regression/existing-features.test.ts`

**Success Criteria:**
- All existing tests still pass
- No performance degradation
- No breaking changes to existing APIs
- Context injection priorities work correctly

---

## Decisions Log
[Will document all business logic and UI/UX decisions made during implementation]
