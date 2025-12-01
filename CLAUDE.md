# CLAUDE.md

> **LIVE ON VERCEL** - Production deployment active. Test thoroughly before committing.

**Detailed workflows:** [asura-workflows.md](/Users/d.patnaik/code/vault/docs/asura/asura-workflows.md)

## Working Docs

Go to /Users/d.patnaik/code/vault/Welcome.md.
Read the file.
Then find the open docs in /Users/d.patnaik/code/vault/docs/asura.
We will work on the open docs.

## Tech Stack

- **Frontend**: SvelteKit 2.x, Svelte 5 (runes: `$state`, `$effect`, `$props`, `$derived`), Tailwind CSS 4.1
- **Backend**: SvelteKit API routes, Supabase PostgreSQL with RLS
- **AI**: Anthropic Claude (Haiku 4.5 default), Voyage AI embeddings (pgvector)
- **APIs**: Brave Search, Cheerio, pdf-parse

## Project Structure

```
src/
├── lib/
│   ├── api/              # Logger, query monitor, rate limiter, Brave search
│   ├── calls/chat/       # AI call logic, compression, table extraction
│   ├── capabilities/     # Content extraction, image extraction, web search
│   ├── components/       # Svelte components
│   ├── composables/      # Reusable reactive state (confirmation timers)
│   ├── config/           # Constants (models, personas, timing, memory)
│   ├── prompts/          # System prompts & personas (Gunnar, Kirby)
│   ├── security/         # Sanitization utilities
│   ├── stores/           # Svelte stores (chat, connectivity)
│   ├── ui/               # Auto-scroll, scroll utilities
│   └── utils/            # Helpers (fetch-with-retry, strip-metadata)
├── routes/
│   ├── chat/             # Chat mode UI
│   └── api/
│       ├── chat/         # Chat messaging, files, compression
│       ├── superjournal/ # Message history, charts
│       ├── settings/     # User preferences
│       ├── export/       # Data export (JSON)
│       └── nuke/         # Data deletion
└── supabase/migrations/  # DB schema
```

## Key Patterns

- **Memory Pyramid**: Superjournal (last 5 full turns) → Journal (compressed) → vector search
- **Token Budget**: 40% context window cap with priority-based truncation
- **Content Markers**: `<!--content:uuid-->` in superjournal, expanded on page load
- **Background Jobs**: Compression + table extraction run after each message
- **Optimistic UI**: Toggle actions update immediately, revert on API failure

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run check    # TypeScript check
```

## Database Tables

- `superjournal` - Full conversation turns (working memory)
- `journal` - Compressed turns with embeddings (long-term memory)
- `content` - Pasted files (raw + artisan cut)
- `charts` - Extracted images/tables (links to content or superjournal)
- `user_settings` - Model preferences, active content
- `models` - AI model catalog with pricing
- `model_parameters` - Per-model settings by use case
- `user_roles` - Admin permissions

## Storage

- `content` bucket - Chart images and thumbnails
