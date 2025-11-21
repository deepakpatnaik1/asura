# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Asura is a SvelteKit-based AI chat application that extends conversational AI memory indefinitely through orchestration-layer innovations. The system uses a multi-call LLM architecture with memory compression ("Artisan Cut") and semantic retrieval to maintain coherent long-term context beyond standard context window limitations.

**Core Innovation**: Two-tier memory architecture (Superjournal for recent context, Journal for compressed semantic memory) combined with vector search enables conversations to scale without bound while maintaining quality and coherence. All AI calls use Claude Sonnet 4.5 for consistent frontier-model performance.

## Technology Stack

- **Framework**: SvelteKit 2.x with Svelte 5
- **Database**: Supabase (PostgreSQL with pgvector extension) - **Remote hosted instance**
- **AI Models**: Anthropic Claude Sonnet 4.5 for all LLM tasks, Voyage AI (voyage-3) for embeddings
- **Testing**: Vitest (unit/integration), Playwright (E2E)
- **Language**: TypeScript with strict mode enabled

## Development Commands

### Local Development
```bash
npm run dev                    # Start dev server (http://localhost:5173)
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

**Important**: E2E tests require dev server running in separate terminal (`npm run dev`).

### Code Quality
```bash
npm run check                  # Type-check with svelte-check
npm run check:watch            # Type-check in watch mode
npm run build                  # Production build
npm run preview                # Preview production build
```

## Core Architecture

### Multi-Call AI System

Asura implements a multi-phase AI call architecture:

**Call 1A/1B** (Chat Response Generation)
- **Call 1A**: Initial response generation with memory context injection (extended thinking enabled)
- **Call 1B**: Refinement and critique of Call 1A output
- Model: Claude Sonnet 4.5 (thinking variant)
- Location: [src/routes/api/chat/+server.ts](src/routes/api/chat/+server.ts)

**Call 2A/2B** (Chat Compression - "Artisan Cut")
- Executes in background after Call 1B completes
- **Call 2A**: Compress full conversation turn to Boss Essence + Persona Essence + Decision Arc + Salience Score
  - Model: Claude Sonnet 4.5 (instruct variant)
  - System prompt: `CALL2A_PROMPT`
  - Input: Full message turn (user message + AI response)
  - Output: JSON with `boss_essence`, `persona_essence`, `decision_arc_summary`, `salience_score`, `is_instruction`, `instruction_scope`
- **Call 2B**: Verify and refine compression output
  - Model: Claude Sonnet 4.5 (instruct variant)
  - Messages: System (`CALL2A_PROMPT`) + Assistant (Call 2A JSON) + User (`CALL2B_PROMPT`)
  - Output: Refined JSON with same structure
- **Embedding**: Call 2B `decision_arc_summary` vectorized via Voyage AI `voyage-3` (1024 dimensions)
- **Database Save**: Final Call 2B output + embedding saved to `journal` table for semantic retrieval
- Location: [src/routes/api/chat/+server.ts:56-195](src/routes/api/chat/+server.ts#L56-L195)

### System Prompts

All system prompts are located in [src/lib/prompts/](src/lib/prompts/) and exported via [src/lib/prompts/index.ts](src/lib/prompts/index.ts):

- `BASE_INSTRUCTIONS`: Core behavioral rules
- `PERSONA_GUNNAR`, `PERSONA_KIRBY`: Personality definitions
- `CALL1A_PROMPT`, `CALL1B_PROMPT`: Chat generation
- `CALL2A_PROMPT`, `CALL2B_PROMPT`: Chat compression

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
- Enforces 40% context window cap with priority-based loading
- Enables indefinite conversation length through intelligent context assembly
- Priority order:
  1. Last 5 Superjournal turns (working memory - immediate context)
  2. Starred messages (user-curated important context)
  3. Instructions (global + persona-specific behavioral directives)
  4. Last 100 Journal turns (recent compressed memory)
  5. Vector search results (semantic retrieval when journal > 100 entries)

### Model Configuration

Centralized in [src/lib/config/models.ts](src/lib/config/models.ts):
- `DEFAULT_CONVERSATION_MODEL`: Call 1A/1B - Claude Sonnet 4.5 (thinking variant with extended thinking)
- `DEFAULT_COMPRESSION_MODEL`: Call 2A/2B - Claude Sonnet 4.5 (instruct variant)
- `EMBEDDING_MODEL`: Voyage AI voyage-3 (1024 dimensions)

All language model tasks use Claude Sonnet 4.5 to ensure consistent frontier-model quality across chat generation and memory compression.

## Database Schema

Key tables (see [supabase/migrations/](supabase/migrations/) for full schema):

- `superjournal`: Full conversation turns (last 5)
- `journal`: Compressed memory with embeddings
- `models`: Available AI models for user selection
- `user_settings`: User preferences (selected models, persona)

**Vector Search Functions**:
- `search_journal_by_embedding`: Semantic search over compressed conversation memory

This function enables the system to retrieve relevant context from arbitrarily large conversation histories, supporting the indefinite memory extension architecture.

**Target Scale**: 999 users (multiuser authentication in development)

## API Endpoints

### Chat
- `POST /api/chat`: Main chat endpoint (Call 1A/1B + background Call 2A/2B)

### Settings
- `GET /api/settings`: Get user settings (selected models, persona)
- `POST /api/settings`: Update user settings

### Utilities
- `POST /api/nuke`: Delete all data (development only)
- `GET /api/superjournal/[id]`: Get superjournal entry details

## UI Workflows

### Nuke Button (Delete All Data)

The nuke button provides atomic deletion of all conversation data. Located in Settings panel.

**Flow**:
1. User clicks "Nuke Everything" button in Settings
2. Modal displays with 3-second countdown progress bar
3. User can cancel during countdown (closes modal, no action taken)
4. If countdown completes:
   - Single atomic database call to `nuke_all_data()` function
   - PostgreSQL function deletes all journal and superjournal entries
   - Transaction ensures all-or-nothing operation
5. Modal closes, UI refreshes with empty state

**Implementation**:
- UI: [src/routes/+page.svelte](src/routes/+page.svelte) `handleNukeConfirm()` function
- API: `POST /api/nuke` endpoint
- Database: [20251121000002_remove_files_from_nuke.sql](supabase/migrations/20251121000002_remove_files_from_nuke.sql)

**Key Features**:
- Atomic operation (transaction-based)
- 3-second safety countdown
- Cancellable before execution
- Clean deletion of all conversation history

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

### Turn Navigation (Previous/Next)

Navigate through conversation history by jumping to boss (user) cards. Located in bottom-right corner of UI.

**Flow**:
1. User clicks "Previous Turn" button
2. `navigateToPreviousTurn()` function:
   - Finds all boss cards using `querySelectorAll('[data-role="boss"]')`
   - Determines current scroll position
   - Finds previous boss card above current position
   - Scrolls to 40px above boss card top (viewport anchor point)
3. User clicks "Next Turn" button
4. `navigateToNextTurn()` function:
   - Finds all boss cards
   - Determines current scroll position
   - Finds next boss card below current position
   - Scrolls to 40px above boss card top (viewport anchor point)

**Implementation**:
- UI: [src/routes/+page.svelte:161-268](src/routes/+page.svelte#L161-L268)
- Buttons: [src/routes/+page.svelte:966-1016](src/routes/+page.svelte#L966-L1016)
- Anchor point: 40px above boss card for consistent viewport positioning

**Key Features**:
- Consistent 40px spacing above each boss card
- Wraps around (previous from top goes to bottom, next from bottom goes to top)
- Smooth scrolling behavior
- Works with dynamically added messages

### Auto-Scroll

Automatic scrolling through conversation history with pause-and-resume pattern.

**Flow**:
1. User clicks "Auto-Scroll" button to enable
2. `startAutoScroll()` function begins 5-second scroll phase:
   - `requestAnimationFrame` loop runs 60fps
   - Each frame adds `pixelsPerFrame` (0.4px) to `fractionalPixelAccumulator`
   - Integer pixels extracted and applied via `scrollBy(0, pixelsToScroll)`
   - Fractional remainder preserved for next frame (prevents stuttering)
3. After 5 seconds, auto-scroll enters 60-second pause:
   - Scrolling stops but auto-scroll remains enabled
   - UI shows "Auto-Scroll (Paused)" state
4. After 60 seconds, returns to step 2 (5-second scroll phase)
5. User clicks "Auto-Scroll" button again to disable

**Implementation**:
- UI: [src/routes/+page.svelte:270-347](src/routes/+page.svelte#L270-L347)
- Button: [src/routes/+page.svelte:1018-1025](src/routes/+page.svelte#L1018-L1025)
- State management: `autoScrollEnabled`, `autoScrollPaused`, `fractionalPixelAccumulator`

**Key Features**:
- 5-second scroll + 60-second pause pattern
- Fractional pixel accumulator prevents stuttering (maintains smooth 0.4px/frame)
- Pause preserves scroll position (no drift)
- Clean state management with proper RAF cleanup

### Auto-Scroll to New Message

Automatically scrolls to newly submitted user message (boss card).

**Flow**:
1. User submits message via chat input
2. `scrollToLatestBossCard()` function:
   - Uses double `requestAnimationFrame` pattern for DOM stability
   - First RAF: Browser commits DOM changes (new boss card rendered)
   - Second RAF: Measurements guaranteed stable
   - Queries for last boss card: `querySelectorAll('[data-role="boss"]')`
   - Scrolls to 40px above boss card top (matches turn navigation anchor)

**Implementation**:
- UI: [src/routes/+page.svelte:349-392](src/routes/+page.svelte#L349-L392)
- Triggered in: `handleSubmit()` function after message sent

**Key Features**:
- Double RAF pattern ensures DOM stability before measuring
- Consistent 40px anchor point (matches turn navigation)
- Graceful handling of missing boss cards
- Smooth scroll behavior

## UI Layout & Responsive Design

### Master Variable Layout System

**Master Variable**: `--content-text-width: 450px` ([src/app.css:41](src/app.css#L41))
- Single source of truth for all layout widths
- Boss card width equals content text width exactly
- All other elements scale from this value

**Layout Widths**:
- Boss card: 450px (padding: 16px, content area: 418px)
- AI message: 450px (padding: 16px, content area: 418px)
- Input container: 450px max-width
- Messages content: 450px max-width (centered)

**Responsive Behavior**:
- Wide screens (>900px): Chat centered, 450px width maintained
- Narrow screens (≤900px): Messages content constrained to 450px, centered with 16px padding
- All screen sizes: Content width remains 450px for optimal readability

**Implementation**:
- Master variable: [src/app.css:41](src/app.css#L41)
- Narrow screen constraint: [src/routes/+page.svelte:1020-1023](src/routes/+page.svelte#L1020-L1023)

## Testing Strategy

**Unit Tests** ([tests/unit/](tests/unit/))
- Test individual functions and modules in isolation
- Mock external dependencies (Supabase, AI APIs)
- Fast execution, no external services required

**Integration Tests** ([tests/integration/](tests/integration/))
- Test database operations, API endpoints, and stores
- Includes database schema validation, CRUD operations, vector search

**Regression Tests** ([tests/regression/](tests/regression/))
- Ensure critical flows remain stable (chat flow, context injection)
- Run against real database and API endpoints

**E2E Tests** ([tests/e2e/](tests/e2e/))
- Full user workflows with Playwright
- Requires dev server running
- Located in `tests/e2e/`, run with `npm run test:e2e`

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Supabase
PUBLIC_SUPABASE_URL=          # Supabase project URL (remote hosted instance)
PUBLIC_SUPABASE_ANON_KEY=     # Supabase anon key
SUPABASE_SERVICE_ROLE_KEY=    # Supabase service role key (server-side only)

# AI API Keys
ANTHROPIC_API_KEY=            # Anthropic API key (Claude models)
VOYAGE_API_KEY=               # Voyage AI API key (embeddings)

# Optional: Future providers
# OPENAI_API_KEY=             # OpenAI API key (GPT models)
# FIREWORKS_API_KEY=          # Fireworks AI API key
```

This project uses a remote Supabase instance. Get your credentials from your Supabase project dashboard at https://supabase.com/dashboard.

**IMPORTANT - API Key Security**:
- ✅ `.env` file is in `.gitignore` - NEVER commit it
- ✅ All API keys must stay in `.env` only (local development)
- ✅ For production, set environment variables in your hosting platform (Vercel, Netlify, etc.)
- ❌ NEVER commit API keys to git (even in documentation or example files)
- 🔄 If keys are accidentally committed, immediately:
  1. Rotate (delete and regenerate) the exposed keys
  2. Update `.env` with new keys
  3. Consider using `git filter-repo` to clean history (advanced)

## Important Development Notes

### Security & Authentication

**Multi-User Security** (Implemented 2025-11-21)
- ✅ Row-Level Security (RLS) enabled on all user-data tables
- ✅ Admin role system with `user_roles` table and `is_admin()` helper function
- ✅ Database-level isolation: Users can only access their own data
- ✅ Admin bypass: Admin users can view/manage all users' data

**RLS Policy Pattern**:
```sql
-- Regular users see only their data, admins see all data
CREATE POLICY "Policy name" ON table_name
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));
```

**Authentication Flow**:
1. User authenticates via Supabase Auth (JWT-based)
2. `hooks.server.ts` validates session with `safeGetSession()`
3. All API endpoints check authentication before processing
4. RLS policies enforce data isolation at database level

**Admin Access**:
- Admin role stored in `user_roles` table
- Admin account: deepakpatnaik1@gmail.com
- Admins can view/manage all users' conversations, settings, and token usage
- Regular users remain isolated to their own data

**Key Security Files**:
- [src/hooks.server.ts](src/hooks.server.ts) - Authentication middleware (uses ANON_KEY, respects RLS)
- [supabase/migrations/20251121120000_enable_rls_for_multiuser.sql](supabase/migrations/20251121120000_enable_rls_for_multiuser.sql) - RLS foundation
- [supabase/migrations/20251121130000_create_admin_role_system.sql](supabase/migrations/20251121130000_create_admin_role_system.sql) - Admin role system
- [multi-user-security-continued.md](multi-user-security-continued.md) - Complete security analysis

### Database Migrations
- All schema changes go in `supabase/migrations/` with timestamp prefix
- **IMPORTANT**: Apply migrations to remote database via **Supabase Dashboard SQL Editor**
  - Navigate to: https://supabase.com/dashboard/project/hsxjcowijclwdxcmhbhs/sql
  - Copy migration SQL and paste into editor
  - Click "Run" to apply
- **DO NOT use** `npx supabase db push` (causes migration history conflicts with remote database)
- Migration naming: `YYYYMMDDHHMMSS_description.sql`

### Vector Search
- All embeddings are 1024 dimensions (Voyage AI voyage-3 model)
- Similarity uses cosine distance via pgvector: `embedding <=> query_embedding`
- Journal vector search only activates when journal count > 100

### Context Window Management
- Hard cap at 40% of model's context window to ensure reliable performance
- Priority-based loading ensures most critical context loaded first
- Intelligent context assembly enables conversations to continue indefinitely beyond typical context limits
- Token estimation: 1 token ≈ 4 characters (rough approximation)

### Thinking Tags
- Some models output `<think>...</think>` tags for internal reasoning
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

### Running Specific Tests
```bash
# Single test file
npm run test:unit tests/unit/lib/context-builder.test.ts

# Single test suite (within file)
npm run test:unit -- -t "assembleContext"

# Integration tests for database
npm run test:integration tests/integration/database/

# Watch mode for active development
npm run test:watch
```
