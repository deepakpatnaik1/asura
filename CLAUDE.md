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

AI chat app with two modes:
- **Chat**: Strategic conversations with Gunnar (mentor) or Kirby (marketer)
- **Reader**: Article discussion with Samara (teacher)

## Tech Stack

- **Frontend**: SvelteKit 2.x, Svelte 5 runes (`$state`, `$effect`, `$props`, `$derived`)
- **Backend**: SvelteKit API routes, Supabase PostgreSQL with RLS
- **AI**: Anthropic Claude, Voyage AI embeddings (pgvector)
- **APIs**: Brave Search, Cheerio, pdf-parse, Sharp

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
│   ├── chat/             # Chat mode UI
│   ├── reader/           # Reader mode UI
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

**Reader Mode:** No compression, no vector search - full conversations stored in superjournal only.

## Key Patterns

- **Content Markers**: `<!--content:uuid-->` stored in superjournal, expanded on page load
- **Background Jobs**: Compression + table extraction run async after each message
- **Optimistic UI**: Toggle actions update immediately, revert on API failure
- **Mode Separation**: Chat/reader have separate personas, models, files, starred items

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
| POST /api/nuke | Delete all data for mode |
| GET /api/health | Server/database status |

## Personas

- **Gunnar** (chat): YC mentor, challenges assumptions
- **Kirby** (chat): Guerrilla marketer, bold ideas
- **Samara** (reader): Deep reading teacher, pattern recognition

Stored per mode: `selected_persona_chat`, `selected_persona_reader`

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
