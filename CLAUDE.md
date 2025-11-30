# CLAUDE.md

> **LIVE ON VERCEL** - Production deployment active. All changes require careful, systematic implementation. Test thoroughly before committing.

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
│   ├── api/              # Logger, query monitor, rate limiter
│   ├── calls/            # AI call logic (chat/, reader/)
│   ├── capabilities/     # Feature implementations (webSearch, compression)
│   ├── components/       # Svelte components
│   ├── composables/      # Reusable reactive state (confirmation timers)
│   ├── config/           # Constants (models, personas, timing, memory)
│   ├── context-builder.ts # AI context with priority-based token budget
│   ├── prompts/          # System prompts & personas
│   ├── security/         # Sanitization utilities
│   ├── stores/           # Svelte stores (chat, connectivity)
│   ├── ui/               # Scroll utilities
│   └── utils/            # Helpers (fetch-with-retry, strip-metadata)
├── routes/
│   ├── chat/             # Chat mode (Gunnar & Kirby personas)
│   ├── reader/           # Reader mode (Samara persona)
│   └── api/              # REST endpoints
│       ├── chat/         # Chat messaging, files, compression
│       ├── reader/       # Articles, processing, Q&A
│       ├── superjournal/ # Message history, charts
│       ├── export/       # Data export
│       └── nuke/         # Data deletion
└── supabase/migrations/  # DB schema
```

## Key Patterns

- **Context Pyramid**: Superjournal (last 5 full turns) → Journal (compressed) → vector search
- **Token Budget**: 40% context window cap with priority-based truncation
- **Optimistic UI**: Toggle actions update immediately, revert on API failure
- **Parallel Queries**: Context builder runs independent queries concurrently

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run check    # TypeScript check
```

## Database Tables

- `superjournal` - Full conversation turns (working memory)
- `journal` - Compressed turns with embeddings (long-term memory)
- `articles` - Reader mode articles
- `files` - Chat mode uploaded files
- `user_settings` - Per-user preferences
