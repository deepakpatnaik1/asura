# CLAUDE.md

> **LIVE ON VERCEL** - Production deployment active. Test thoroughly before committing.

## Working Docs

Go to /Users/d.patnaik/code/vault/Welcome.md.
Read the file.
Then find the open docs in /Users/d.patnaik/code/vault/docs/asura.
We will work on the open docs.

**Reference:** [asura-workflows.md](/Users/d.patnaik/code/vault/docs/asura/asura-workflows.md) - comprehensive workflow documentation

---

## What Is Asura?

AI mentor toolkit. Single unified interface at `/` with 4 personas sharing one conversation thread:
- **Gunnar**: Startup mentor - finance, bootstrapping, strategy (6 whiteboard tools)
- **Kirby**: Guerrilla marketer - bold ideas, different mindspace
- **Samara**: Reading teacher - deep reading, pattern recognition
- **Alicja**: Productivity collector - todos, calendar, founder diary (14 tools)

Persona dropdown switches who you talk to next. History shows all personas interleaved.

## Tech Stack

- **Frontend**: SvelteKit 2.x, Svelte 5 runes (`$state`, `$effect`, `$props`, `$derived`)
- **Backend**: SvelteKit API routes, Supabase PostgreSQL with RLS
- **Database**: Local Supabase via Docker Desktop (port 54322)
- **AI**: Anthropic Claude, Voyage AI embeddings (pgvector)
- **APIs**: Brave Search, Cheerio, pdf-parse, Sharp

## Local Database (Local-Only Setup)

**We use local Supabase via Docker Desktop exclusively. No remote database.**

**.env must point to local Supabase:**
```
PUBLIC_SUPABASE_URL=http://localhost:54321
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
```

**Start/stop Supabase:**
```bash
npx supabase start   # Start all containers
npx supabase stop    # Stop containers (preserves data)
```

**Dev login (bypasses Google OAuth):**
```
http://localhost:5173/auth/dev-login
```

Run migrations:
```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -f supabase/migrations/MIGRATION_FILE.sql
```

Query the database:
```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -c "SELECT * FROM models;"
```

**Do NOT use any `npx supabase db` commands** - they target remote Supabase which we don't use.

## Commands

```bash
npm run dev      # Start dev server (port 5173)
npm run build    # Production build
npm run check    # TypeScript check
```

## Project Structure

```
src/
├── lib/
│   ├── api/              # Logger, rate limiter, Brave search, Anthropic client
│   ├── calls/chat/       # AI calls, compression, table extraction, retry logic
│   ├── capabilities/     # Content/image extraction, web search
│   ├── components/       # Svelte components (MessageGroup, PasteArea, etc.)
│   ├── composables/      # Reusable reactive state (confirmation timers)
│   ├── config/           # Constants (models, personas, timing, memory)
│   ├── prompts/          # System prompts & personas
│   ├── schemas/          # Zod validation schemas
│   ├── stores/           # Svelte stores (chat, connectivity)
│   └── ui/               # Auto-scroll, scroll utilities
├── routes/
│   ├── +page.svelte      # Main UI (single route at /)
│   └── api/              # REST endpoints
└── supabase/migrations/  # DB schema
```

## Memory Pyramid

| Tier | Table | Content | Behavior |
|------|-------|---------|----------|
| Working | superjournal | Last 5 full turns | Always included |
| Recent | journal | Compressed summaries | Last 100, truncated to fit |
| Semantic | journal + embedding | Vector search | Top 10 if space (activates at 100+ entries) |

**Context Budget:** 40% of model context window, priority-based truncation.

## Key Patterns

- **Content Markers**: `<!--content:uuid-->` stored in superjournal, expanded on page load
- **Background Jobs**: Compression + table extraction run async after each message
- **Optimistic UI**: Toggle actions update immediately, revert on API failure
- **Dual-layer Whiteboard**: Render (visual elements) + semantic (meaning) stored separately

## Database Tables

| Table | Purpose |
|-------|---------|
| superjournal | Full conversation turns (working memory) |
| journal | Compressed turns with embeddings (long-term) |
| content | Pasted files/articles (raw + artisan cut) |
| charts | Extracted images/tables from content or AI responses |
| user_settings | Model preferences, active content, personas per mode |
| models | AI model catalog with pricing |
| model_parameters | Per-model settings by use case |
| personas | Available personas with mode assignment |

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| POST /api/chat | Send message, stream response |
| GET/POST /api/chat/files | List/upload content |
| PUT/DELETE /api/chat/files/[id] | Rename/delete content |
| POST /api/chat/compress | Compression retry (background job) |
| GET /api/superjournal | Message history with pagination |
| PATCH/DELETE /api/superjournal/[id] | Star/delete message |
| GET/PUT /api/settings | User preferences |
| POST /api/nuke | Delete by bucket (persona, content tier, productivity) |
| GET /api/health | Server/database status |

## Canvas Panel

Three canvas types in right panel:
- **Charts**: Image/table carousel from pasted content or AI responses
- **Calendar**: Planner/todo/done productivity workspace
- **Notes**: Konva whiteboard with note/label/line/arrow/group elements

Personas have default canvas assignments. Canvas switcher in footer.

## Charts

**Two Sources:**
1. File paste → extracts images/tables from HTML → `charts.content_id` FK
2. AI response → extracts markdown tables → `charts.superjournal_id` FK

**Storage:** Supabase `content` bucket with full image + 150px thumbnail.

## Compression (Artisan Cut)

**Trigger:** After AI response, async background job.

**Output:** JSON with `boss_essence`, `persona_essence`, `decision_arc_summary`, `salience_score`

**Retry:** 1min, 5min, 10min backoffs (no page load detection - retry logic is sufficient).

## Rate Limits

| Type | Limit | Used For |
|------|-------|----------|
| ai | 1/min | Chat, LLM calls |
| read | 30/min | History, charts |
| write | 10/min | Settings, export |
