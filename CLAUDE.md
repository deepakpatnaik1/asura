# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Asura is a SvelteKit-based AI chat application that features a sophisticated multi-call LLM architecture with memory compression, file processing, and vector search capabilities. The system uses a two-tier memory architecture (Superjournal for full turns, Journal for compressed memory) and implements semantic file chunking with vector embeddings.

## Technology Stack

- **Framework**: SvelteKit 2.x with Svelte 5
- **Database**: Supabase (PostgreSQL with pgvector extension)
- **AI Models**: Fireworks AI (Qwen3-235B variants) for chat/compression, Voyage AI (voyage-3) for embeddings
- **Testing**: Vitest (unit/integration), Playwright (E2E)
- **Language**: TypeScript with strict mode enabled

## Development Commands

### Local Development
```bash
npm run dev                    # Start dev server (http://localhost:5173)
npx supabase start            # Start local Supabase (required for development)
npx supabase db reset         # Reset database with all migrations
```

### Testing
```bash
npm test                       # Run all unit + integration tests (Vitest)
npm run test:unit              # Run unit tests only
npm run test:integration       # Run integration tests only
npm run test:watch             # Run tests in watch mode
npm run test:ui                # Open Vitest UI
npm run test:e2e               # Run Playwright E2E tests (requires dev server running)
npm run test:e2e:ui            # Open Playwright UI
npm run test:all               # Run unit + integration + E2E tests
npm run test:coverage          # Generate coverage report
```

**Important**: Integration tests require Supabase to be running (`npx supabase start`). E2E tests require dev server running in separate terminal (`npm run dev`).

### Code Quality
```bash
npm run check                  # Type-check with svelte-check
npm run check:watch            # Type-check in watch mode
npm run build                  # Production build
npm run preview                # Preview production build
```

### Supabase Local Development
```bash
npx supabase start            # Start local stack (DB port: 54322, API port: 54321, Studio: 54323)
npx supabase stop             # Stop local stack
npx supabase db reset         # Drop and recreate database with migrations
npx supabase db push          # Push local migrations to remote
```

The Supabase config is in [supabase/config.toml](supabase/config.toml). Local database connection: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## Core Architecture

### Multi-Call AI System

Asura implements a multi-phase AI call architecture:

**Call 1A/1B** (Chat Response Generation)
- **Call 1A**: Initial response generation with memory context injection (uses thinking model)
- **Call 1B**: Refinement and critique of Call 1A output
- Model: User-selectable conversation model (default: Qwen3-235B thinking variant)
- Location: [src/routes/api/chat/+server.ts](src/routes/api/chat/+server.ts)

**Call 2A/2B** (Chat Compression - "Artisan Cut")
- **Call 2A**: Compress full conversation turn to Boss Essence + Persona Essence + Decision Arc
- **Call 2B**: Verify and refine compression output
- Model: User-selectable compression model (default: Qwen3-235B instruct variant)
- Output: Saved to `journal` table with vector embeddings
- Location: [src/routes/api/chat/+server.ts](src/routes/api/chat/+server.ts) (background function)

**Call 3A/3B** (File Overview + Chunking)
- **Call 3A**: Generate file-level overview (Chunk 0) AND logical chunk boundaries
- **Call 3B**: Verify output quality
- Combined single-phase approach (not separate calls)
- Location: [src/lib/file-chunker.ts](src/lib/file-chunker.ts)

**Modified Call 2A/2B** (Detail Chunk Compression)
- Compress individual file chunks for detail retrieval
- Uses same structure as Call 2A/2B but optimized for file content
- Location: [src/lib/file-compressor.ts](src/lib/file-compressor.ts)

### System Prompts

All system prompts are located in [src/lib/prompts/](src/lib/prompts/) and exported via [src/lib/prompts/index.ts](src/lib/prompts/index.ts):

- `BASE_INSTRUCTIONS`: Core behavioral rules
- `PERSONA_GUNNAR`, `PERSONA_KIRBY`: Personality definitions
- `CALL1A_PROMPT`, `CALL1B_PROMPT`: Chat generation
- `CALL2A_PROMPT`, `CALL2B_PROMPT`: Chat compression
- `CALL3A_PROMPT`, `CALL3B_PROMPT`: File overview
- `MODIFIED_CALL2A_PROMPT`, `MODIFIED_CALL2B_PROMPT`: File detail chunks

### Memory Architecture

**Superjournal Table** (Working Memory)
- Stores last 5 full, uncompressed conversation turns
- Fields: `user_message`, `ai_response`, `persona_name`
- Used for immediate context in Call 1A/1B

**Journal Table** (Compressed Memory)
- Stores compressed conversation history (Artisan Cut format)
- Fields: `boss_essence` (user), `persona_essence` (AI), `decision_arc_summary`, `salience_score` (1-10)
- Includes 1024-dim vector embeddings for semantic search
- Special flags: `is_starred` (user-pinned), `is_instruction` (behavioral directives)

**Context Builder** ([src/lib/context-builder.ts](src/lib/context-builder.ts))
- Enforces 40% context window cap with priority-based loading:
  1. Last 5 Superjournal turns (working memory)
  2. Starred messages (user-curated)
  3. Instructions (global + persona-specific)
  4. Last 100 Journal turns (recent memory)
  5. Vector search results (if journal count > 100)
  6. File overviews + file chunk vector search

### File Processing Pipeline

**Full Pipeline** ([src/lib/file-processor.ts](src/lib/file-processor.ts)):
1. **Extraction** (0-10%): Extract text from PDF/TXT/MD files
2. **Chunking** (10-30%): Generate overview + logical chunks (combined Call 3A/3B)
3. **Compression - Chunk 0** (30-40%): Compress overview for discovery
4. **Compression - Details** (40-70%): Compress detail chunks in parallel (batches of 5, 5s delay)
5. **Embedding** (70-90%): Generate 1024-dim Voyage embeddings (batches of 5, 5s delay)
6. **Finalization** (90-100%): Save all chunks to `file_chunks` table

**Key Components**:
- [src/lib/file-extraction.ts](src/lib/file-extraction.ts): Text extraction (PDF via unpdf, plaintext direct)
- [src/lib/file-chunker.ts](src/lib/file-chunker.ts): Combined overview + logical chunking
- [src/lib/file-compressor.ts](src/lib/file-compressor.ts): Artisan Cut compression for chunks
- [src/lib/vectorization.ts](src/lib/vectorization.ts): Voyage AI embedding generation
- [src/lib/batch-processor.ts](src/lib/batch-processor.ts): Parallel processing with rate limiting

**Database Tables**:
- `files`: File metadata, status tracking, progress updates
- `file_chunks`: Individual chunks with embeddings (chunk_index 0 = overview)

### Model Configuration

Centralized in [src/lib/config/models.ts](src/lib/config/models.ts):
- `DEFAULT_CONVERSATION_MODEL`: Call 1A/1B (thinking variant)
- `DEFAULT_COMPRESSION_MODEL`: Call 2A/2B, Call 3A/3B (instruct variant)
- `FILE_MODEL`: File processing (instruct variant, not user-selectable)
- `EMBEDDING_MODEL`: voyage-3 (1024 dimensions)

User can select conversation and compression models via Settings UI. Selection is stored in `user_settings` table and read at runtime.

## Database Schema

Key tables (see [supabase/migrations/](supabase/migrations/) for full schema):

- `superjournal`: Full conversation turns (last 5)
- `journal`: Compressed memory with embeddings
- `files`: File metadata and processing status
- `file_chunks`: Chunked file content with embeddings
- `models`: Available AI models for user selection
- `user_settings`: User preferences (selected models, persona)

**Vector Search Functions**:
- `search_journal_by_embedding`: Semantic search over journal entries
- `search_file_chunks`: Semantic search over file chunks

All tables support `user_id IS NULL` for single-user development mode (auth not yet implemented).

## API Endpoints

### Chat
- `POST /api/chat`: Main chat endpoint (Call 1A/1B + background Call 2A/2B)

### Files
- `POST /api/files/upload`: Upload file (creates pending record, triggers background processing)
- `GET /api/files`: List all files
- `GET /api/files/[id]`: Get file details with chunks
- `DELETE /api/files/[id]`: Delete file and all chunks
- `GET /api/files/events`: SSE endpoint for real-time file processing updates

### Settings
- `GET /api/settings`: Get user settings (selected models, persona)
- `POST /api/settings`: Update user settings

### Utilities
- `POST /api/nuke`: Delete all data (development only)
- `GET /api/superjournal/[id]`: Get superjournal entry details

## UI Workflows

### Nuke Button (Delete All Data)

The nuke button provides atomic deletion of all conversation and file data. Located in Settings panel.

**Flow**:
1. User clicks "Nuke Everything" button in Settings
2. Modal displays with 3-second countdown progress bar
3. User can cancel during countdown (closes modal, no action taken)
4. If countdown completes:
   - Single atomic database call to `nuke_everything()` function
   - PostgreSQL function executes TRUNCATE CASCADE on all tables
   - Superjournal, journal, files, file_chunks all cleared atomically
   - Transaction ensures all-or-nothing operation
5. Modal closes, UI refreshes with empty state

**Implementation**:
- UI: [src/routes/+page.svelte](src/routes/+page.svelte) `handleNukeConfirm()` function
- API: `POST /api/nuke` endpoint
- Database: [20251117000000_create_nuke_function.sql](supabase/migrations/20251117000000_create_nuke_function.sql)

**Key Features**:
- Atomic operation (transaction-based)
- 3-second safety countdown
- Cancellable before execution
- Cascading deletes ensure referential integrity

### File Delete Button

Individual file deletion with cascade to all related chunks. Located next to each file in Files panel.

**Flow**:
1. User clicks trash icon next to file
2. Modal displays with 3-second countdown progress bar
3. User can cancel during countdown (closes modal, no action taken)
4. If countdown completes:
   - `DELETE /api/files/[id]` called
   - Database CASCADE automatically removes all `file_chunks` entries
   - Supabase Realtime broadcasts DELETE event to `files` table
   - SSE endpoint receives event, broadcasts to all connected clients
   - UI receives `file-deleted` SSE event, removes file from local state
5. Modal closes, file disappears from UI immediately

**Implementation**:
- UI: [src/routes/+page.svelte](src/routes/+page.svelte) `handleFileDeleteConfirm()` function
- API: `DELETE /api/files/[id]` endpoint
- SSE: [src/routes/api/files/events/+server.ts](src/routes/api/files/events/+server.ts) `handleFilesEvent()`
- Database: [20251111120100_create_files_table.sql](supabase/migrations/20251111120100_create_files_table.sql) ON DELETE CASCADE

**Key Features**:
- Real-time UI update via SSE (no refresh needed)
- Cascade delete ensures chunks removed automatically
- 3-second safety countdown
- Multi-client synchronization (all connected clients see deletion)

### Message Abort Button

Stops AI response generation mid-stream. Located in action bar while message is streaming.

**Flow**:
1. User submits message, AI response begins streaming
2. Trash icon (abort button) appears in message action bar
3. User clicks abort button
4. `handleAbortCurrentMessage()` function:
   - Sets `isLoading` to `false` (stops streaming)
   - Clears `currentMessage` state (removes partial response)
   - Logs abort action to console
5. UI immediately stops displaying streaming text
6. Partial response is discarded (not saved to database)

**Implementation**:
- UI: [src/routes/+page.svelte](src/routes/+page.svelte) `handleAbortCurrentMessage()` function
- Client-side only (no API call needed)
- Reactive state management via Svelte stores

**Key Features**:
- Instant response (no network round-trip)
- Clean state cleanup
- Partial responses not persisted
- Simple implementation (3 lines of code)

## Testing Strategy

**Unit Tests** ([tests/unit/](tests/unit/))
- Test individual functions and modules in isolation
- Mock external dependencies (Supabase, AI APIs)
- Fast execution, no external services required

**Integration Tests** ([tests/integration/](tests/integration/))
- Test database operations, API endpoints, and stores
- Requires local Supabase running
- Includes database schema validation, CRUD operations, vector search

**Regression Tests** ([tests/regression/](tests/regression/))
- Ensure critical flows remain stable (chat flow, context injection)
- Run against real database and API endpoints

**E2E Tests** ([tests/e2e/](tests/e2e/))
- Full user workflows with Playwright
- Requires dev server + Supabase running
- Located in `tests/e2e/`, run with `npm run test:e2e`

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
PUBLIC_SUPABASE_URL=          # Supabase project URL
PUBLIC_SUPABASE_ANON_KEY=     # Supabase anon key
SUPABASE_SERVICE_ROLE_KEY=    # Supabase service role key (server-side only)
FIREWORKS_API_KEY=            # Fireworks AI API key
VOYAGE_API_KEY=               # Voyage AI API key
```

For local development, Supabase values come from `npx supabase start` output.

## Important Development Notes

### File Processing
- Files are processed asynchronously after creating pending record
- Progress updates broadcast via Supabase Realtime (subscribed via SSE endpoint)
- Batch processing limits: 5 concurrent compressions/embeddings, 5s delay between batches
- File size limit: 10MB (enforced in [src/lib/file-processor.ts](src/lib/file-processor.ts))

### Database Migrations
- All schema changes go in `supabase/migrations/` with timestamp prefix
- Use `npx supabase db reset` to apply all migrations to local database
- Migration naming: `YYYYMMDDHHMMSS_description.sql`

### Vector Search
- All embeddings are 1024 dimensions (Voyage AI voyage-3 model)
- Similarity uses cosine distance via pgvector: `embedding <=> query_embedding`
- Journal vector search only activates when journal count > 100

### Context Window Management
- Hard cap at 40% of model's context window
- Priority-based loading ensures most critical context loaded first
- Token estimation: 1 token ≈ 4 characters (rough approximation)

### Error Handling
- Custom error classes: `FileProcessorError`, `FileExtractionError`, `FileChunkerError`, `FileCompressionError`, `VectorizationError`
- Failed files marked with status='failed', error message stored in `error_message` column
- Progress updates continue even on errors (allows client to track failures)

### Thinking Tags
- Qwen3 thinking variant outputs `<think>...</think>` tags
- These are stripped before presenting to user or compressing
- Helper functions in [src/routes/api/chat/+server.ts](src/routes/api/chat/+server.ts): `extractThinking()`, `extractMessage()`

## Common Workflows

### Adding a New Persona
1. Create prompt file in [src/lib/prompts/](src/lib/prompts/) (e.g., `persona-[name].ts`)
2. Export from [src/lib/prompts/index.ts](src/lib/prompts/index.ts)
3. Add to persona selection in [src/routes/api/chat/+server.ts](src/routes/api/chat/+server.ts)
4. Update Settings UI to include new persona option

### Modifying Memory Structure
1. Create migration in `supabase/migrations/` to alter schema
2. Update TypeScript types in relevant files ([src/lib/context-builder.ts](src/lib/context-builder.ts), etc.)
3. Update context builder to handle new fields
4. Add integration tests in [tests/integration/database/](tests/integration/database/)

### Debugging File Processing
1. Check file status in database: `SELECT * FROM files WHERE id = '...'`
2. Check chunks: `SELECT * FROM file_chunks WHERE file_id = '...' ORDER BY chunk_index`
3. Enable console logs in [src/lib/file-processor.ts](src/lib/file-processor.ts) (already present with `[FileProcessor]` prefix)
4. Test individual stages: extraction, chunking, compression, embedding

### Running Specific Tests
```bash
# Single test file
npm run test:unit tests/unit/lib/file-processor.test.ts

# Single test suite (within file)
npm run test:unit -- -t "processFile"

# Integration tests for database
npm run test:integration tests/integration/database/

# Watch mode for active development
npm run test:watch
```
