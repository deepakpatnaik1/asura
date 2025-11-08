# Development TODOs

## Database Schema
- [ ] **Make user_id NOT NULL again** - Currently nullable for development (no auth). When implementing proper authentication, run migration to make `user_id` NOT NULL in both `superjournal` and `journal` tables.

## Security
- [ ] **Re-enable RLS policies** - Disabled for early development via migration `20251108000003_disable_rls.sql`. Must re-enable with proper policies before production.
- [ ] **Implement authentication** - Supabase Auth integration with proper user sessions

## Architecture
- [ ] **Implement full Call 2A/2B** - Artisan Cut compression with verification
- [ ] **Add vector embeddings** - Voyage AI integration for Journal table
- [ ] **Implement all six personas** - Currently only basic scaffolding
- [ ] **Add memory context loading** - Load last 5 Superjournal + last 100 Journal into Call 1A/1B
- [ ] **Implement Decision Arcs retrieval** - Vector search for relevant context

## Production Readiness
- [ ] **Migrate to Supabase Edge Functions** - Move from SvelteKit endpoints to Edge Functions for global low-latency deployment. Currently using `src/routes/api/chat/+server.ts` for development speed.

## Features
- [ ] **File upload with logical chunking** - LLM-based intelligent file processing
- [ ] **Starred messages** - UI and backend for pinning important conversations
- [ ] **Lazy loading for message history** - Currently loads all Superjournal entries on startup. Implement infinite scroll: load last 10 turns initially, then load next 10 as user scrolls up
