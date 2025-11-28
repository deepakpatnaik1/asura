# CLAUDE.md

## Documentation

All documentation lives in `../docs/asura/` (sibling directory to this project).

## Tech Stack

- **Frontend**: SvelteKit 2.x, Svelte 5, Tailwind CSS 4.1
- **Backend**: SvelteKit API routes, Supabase PostgreSQL
- **AI**: Anthropic Claude (Haiku 4.5 default), Voyage AI embeddings
- **APIs**: Brave Search, Cheerio, pdf-parse

## Project Structure

```
src/
├── lib/
│   ├── calls/chat|reader/   # AI call logic
│   ├── capabilities/        # Feature implementations
│   ├── config/              # Constants (models, personas, timing)
│   ├── prompts/             # System prompts & personas
│   └── stores/              # Svelte state management
├── routes/
│   ├── chat/                # Chat mode
│   ├── reader/              # Reader mode
│   └── api/                 # REST endpoints
└── supabase/migrations/     # DB schema
```

## Key Patterns

- **Mode Registry**: Pluggable modes (chat, reader) with their own personas and capabilities
- **Capability System**: Features (webSearch, compression, contextInjection) decoupled per mode
- **Context Pyramid**: Superjournal (last 5 turns) + Journal (compressed) + vector search
- **Three Personas**: Gunnar & Kirby (chat), Samara (reader)

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run test     # Run tests
```
