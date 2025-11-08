# Asura

AI advisory system for startup founders with perpetual conversation continuity. Unlike traditional AI chat applications that eventually "forget" past conversations, Asura implements a sophisticated multi-call architecture with intelligent memory compression that never loses context.

## Core Innovation

**Perpetual Memory Through Artisan Cut Compression**

- Three-tier memory architecture (working/recent/long-term) mimicking human cognitive patterns
- Four-call system with self-critique: Call 1A → 1B → 2A → 2B
- Regenerability-based compression (not naive summarization)
- Decision Arcs with salience scoring (1-10) for semantic retrieval
- Cost-effective: 4 cheap LLM calls < 1 expensive call

## Documentation

- [asura-vision.md](docs/asura-vision.md) - Complete architecture and design philosophy
- [system-prompts.md](docs/system-prompts.md) - All system prompts for the multi-call architecture

## Six AI Personas

1. **Gunnar** - YC Startup Mentor (execution, WHAT and HOW)
2. **Vlad** - First Principles Thinker (reasoning, WHY and WHETHER)
3. **Kirby** - Guerrilla Marketer (marketing, sales, growth)
4. **Stefan** - Finance Expert (unit economics, metrics, fundraising)
5. **Ananya** - Intellectual Companion (books, ideas, culture)
6. **Samara** - Journal Companion (emotional processing, reflection)

## Tech Stack

- **Frontend**: SvelteKit + TypeScript
- **Styling**: Tailwind CSS v4 (with Typography & Forms plugins)
- **Backend**: Supabase (PostgreSQL + pgvector)
- **AI Services**:
  - Fireworks AI (Qwen 2.5 235B) - LLM inference
  - Voyage AI (Gemini) - Embeddings
- **Development**:
  - MCP Servers (Supabase, Playwright)
  - Playwright for E2E testing

## Getting Started

### Prerequisites

- Node.js 22+ (use nvm: `nvm use 22`)
- Supabase CLI (for local development)

### Installation

1. Clone and install:
```bash
git clone https://github.com/deepakpatnaik1/asura.git
cd asura
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your API keys
```

3. Start development:
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Environment Variables

Required in `.env`:

- `PUBLIC_SUPABASE_URL` - Supabase project URL
- `PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `FIREWORKS_API_KEY` - Fireworks AI API key
- `VOYAGE_API_KEY` - Voyage AI API key

## Multi-Call Architecture

Every user message triggers 4 sequential AI calls:

1. **Call 1A**: Hidden reasoning with full memory context
2. **Call 1B**: Self-critique → refined response (streamed to user)
3. **Call 2A**: Initial Artisan Cut compression
4. **Call 2B**: Compression verification → saved to perpetual memory

This architecture ensures both response quality and memory preservation without expensive models.

## Memory Tiers

- **Working Memory**: Last 5 full turns (Superjournal)
- **Recent Memory**: Last 100 compressed turns (Journal)
- **Long-Term Memory**: Decision Arcs retrieved via vector search

All context fits within 40% of LLM context window, leaving 60% for generation.

## Database Schema

- **superjournal**: Full conversation turns
- **journal**: Artisan Cut compressed turns with embeddings
- **profiles**: User metadata

Uses Supabase pgvector for semantic search over Decision Arcs.

## Development Tools

### MCP Servers

Configured in `mcp.json`:

1. **Supabase MCP** - Database operations via AI
2. **Playwright MCP** - Browser automation via AI

### Supabase Local Development

```bash
supabase start
supabase db reset  # Reset with migrations
```

### Testing

```bash
npm run test:e2e        # Run E2E tests
npm run test:e2e:ui     # Run with Playwright UI
```

## Key Design Principles

1. **Memory Over Model** - Architecture compensates for cheaper models
2. **Self-Critique Quality** - LLM refines its own output (1B & 2B)
3. **Lossless Compression** - Regenerability-based, not summarization
4. **Verified Compression** - Two-step process (2A→2B) prevents memory degradation
5. **Cost Efficiency** - Premium experience at budget pricing

## License

Private project - All rights reserved
