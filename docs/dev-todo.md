# Development TODOs

## Database Schema
- [ ] **Make user_id NOT NULL again** - Currently nullable for development (no auth). When implementing proper authentication, run migration to make `user_id` NOT NULL in both `superjournal` and `journal` tables.

## Security
- [ ] **Re-enable RLS policies** - Disabled for early development via migration `20251108000003_disable_rls.sql`. Must re-enable with proper policies before production.
- [ ] **Implement authentication** - Supabase Auth integration with proper user sessions

## Architecture
- [x] **Implement full Call 2A/2B** - Artisan Cut compression with verification ✅
- [x] **Add vector embeddings** - Voyage AI integration for Journal table ✅
- [ ] **Implement all six personas** - Currently only basic scaffolding
- [x] **Add memory context loading** - Load last 5 Superjournal + last 100 Journal into Call 1A/1B ✅
- [x] **Implement Decision Arcs retrieval** - Vector search for relevant context ✅

## Testing (feature/embeddings branch)
- [ ] **Test instructions system** - Verify behavioral directive detection, scope determination (global vs persona-specific), persona isolation, and auto-salience 10
- [ ] **Test vector search** - Requires >100 journal entries. Verify semantic retrieval, salience weighting, exclusion of duplicates, and top 10 results loading
- [ ] **Test embeddings generation** - Confirm decision arcs are embedded via Voyage AI after Call 2B, stored as 1536-dim vectors, and HNSW index is working
- [ ] **Integration test** - End-to-end test of full priority system (1-5) with context budget enforcement

## Production Readiness
- [ ] **Migrate to Supabase Edge Functions** - Move from SvelteKit endpoints to Edge Functions for global low-latency deployment. Currently using `src/routes/api/chat/+server.ts` for development speed.

## Features
- [ ] **File upload with logical chunking** - LLM-based intelligent file processing
- [ ] **Starred messages** - UI and backend for pinning important conversations
- [ ] **Lazy loading for message history** - Currently loads all Superjournal entries on startup. Implement infinite scroll: load last 10 turns initially, then load next 10 as user scrolls up
