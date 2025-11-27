# Full Refactor Plan

Architectural refactoring to consolidate shared services, extract reusable components, and enable easy addition of new modes.

---

## Goals

1. **Reduce duplication** - Extract ~400 lines of shared code into reusable components
2. **Centralize backend logic** - Calls, prompts, capabilities in dedicated directories
3. **Enable new modes** - Adding a mode becomes: config + page + prompts
4. **Feature portability** - Web search, context injection, file reading as pluggable capabilities
5. **Consistent security** - Auth and sanitization in one place

---

## Target Architecture

```
/src/lib/
├── api/
│   ├── anthropic-client.ts     # Existing
│   ├── brave-search.ts         # Existing
│   ├── stream-protocol.ts      # NEW - SSE event helpers
│   └── parse-sse.ts            # NEW - Client-side parser
│
├── calls/
│   ├── chat/
│   │   ├── converse.ts         # Main conversation (was call1)
│   │   └── compress.ts         # Artisan cut (was call2)
│   ├── reader/
│   │   ├── describe.ts         # Article summary
│   │   └── followup.ts         # Q&A on article
│   └── shared/
│       └── streaming.ts        # Common streaming logic
│
├── capabilities/
│   ├── web-search.ts           # Brave API integration
│   ├── context-injection.ts    # Vector search + superjournal
│   ├── file-reader.ts          # Document/article parsing
│   └── index.ts                # Registry + types
│
├── components/
│   ├── MessageGroup.svelte     # NEW - Boss + AI message pair
│   ├── ConfirmationModal.svelte # NEW - Countdown modal
│   ├── PersonaDropdown.svelte  # NEW - Persona selector
│   ├── InputBar.svelte         # NEW - Textarea + send
│   ├── NukeButton.svelte       # NEW - Destructive action trigger
│   ├── ScrollControls.svelte   # Existing
│   └── SettingsModal.svelte    # Existing
│
├── composables/
│   ├── message-stream.svelte.ts # NEW - Streaming state
│   └── confirmation.svelte.ts   # NEW - Countdown state
│
├── modes/
│   ├── chat.ts                 # Chat mode definition
│   ├── reader.ts               # Reader mode definition
│   ├── registry.ts             # Mode lookup + validation
│   └── types.ts                # Mode interface
│
├── prompts/
│   ├── personas/
│   │   ├── gunnar.ts
│   │   ├── kirby.ts
│   │   └── samara.ts
│   ├── instructions/
│   │   ├── base.ts             # Shared rules
│   │   ├── chat.ts             # Chat-specific
│   │   └── reader.ts           # Reader-specific
│   └── builders/
│       └── system-prompt.ts    # Composes persona + instructions
│
├── security/
│   ├── auth.ts                 # NEW - Authentication helpers
│   ├── sanitize.ts             # NEW - Input/output sanitization
│   └── index.ts
│
├── config/                     # Existing - no changes
├── stores/                     # Existing - may remove chat.ts
└── ui/                         # Existing - no changes
```

---

## Dependency Mapping

### Shared UI Components

| Component | Depends On | Used By |
|-----------|------------|---------|
| `MessageGroup.svelte` | `markdown-renderer.ts`, colors config | Chat page, Reader page |
| `ConfirmationModal.svelte` | timing config | Chat page, Reader page |
| `PersonaDropdown.svelte` | personas config, settings API | Chat page, Reader page |
| `InputBar.svelte` | (none) | Chat page, Reader page |
| `NukeButton.svelte` | `ConfirmationModal.svelte` | Chat page, Reader page |
| `ScrollControls.svelte` | `auto-scroll.svelte.ts`, scroll config | Chat page, Reader page |

### Calls

| Call | Depends On | Called By |
|------|------------|-----------|
| `chat/converse.ts` | `anthropic-client`, `context-injection`, `stream-protocol` | `/api/chat/+server.ts` |
| `chat/compress.ts` | `anthropic-client`, `stream-protocol` | `/api/chat/+server.ts` |
| `reader/describe.ts` | `anthropic-client`, `stream-protocol` | `/api/reader/chat/+server.ts` |
| `reader/followup.ts` | `anthropic-client`, `web-search`, `stream-protocol` | `/api/reader/chat/+server.ts` |

### Capabilities

| Capability | Depends On | Used By |
|------------|------------|---------|
| `web-search.ts` | `brave-search.ts` | `reader/followup.ts`, future: `chat/converse.ts` |
| `context-injection.ts` | Voyage API, Supabase | `chat/converse.ts`, future: `reader/followup.ts` |
| `file-reader.ts` | Cheerio, PDF-parse | Reader upload endpoints |

### Prompts

| Prompt | Depends On | Used By |
|--------|------------|---------|
| `personas/*.ts` | (none) | `builders/system-prompt.ts` |
| `instructions/*.ts` | (none) | `builders/system-prompt.ts` |
| `builders/system-prompt.ts` | personas, instructions | All calls |

### Modes

| Mode Config | Depends On | Used By |
|-------------|------------|---------|
| `modes/chat.ts` | capabilities, prompts, scroll config | Chat page |
| `modes/reader.ts` | capabilities, prompts, scroll config | Reader page |
| `modes/registry.ts` | all mode configs | Pages, API routes |

### Security

| Module | Depends On | Used By |
|--------|------------|---------|
| `security/auth.ts` | Supabase client | All API routes |
| `security/sanitize.ts` | DOMPurify | Reader upload, message rendering |

---

## Implementation Sequence

### Phase 1: Foundation (No Behavior Changes)

Create new files/directories without changing existing behavior.

| Step | Task | Files Created |
|------|------|---------------|
| 1.1 | Create SSE protocol helpers | `/lib/api/stream-protocol.ts` |
| 1.2 | Create SSE parser | `/lib/api/parse-sse.ts` |
| 1.3 | Create mode types | `/lib/modes/types.ts` |
| 1.4 | Create composables directory | `/lib/composables/` |
| 1.5 | Create message-stream composable | `/lib/composables/message-stream.svelte.ts` |
| 1.6 | Create confirmation composable | `/lib/composables/confirmation.svelte.ts` |

**Verification:** Build succeeds, no runtime changes.

---

### Phase 2: Extract UI Components

Extract one component at a time. Pattern: extract → update chat → verify → update reader → verify.

| Step | Task | Files |
|------|------|-------|
| 2.1 | Extract MessageGroup | `/lib/components/MessageGroup.svelte` |
| 2.2 | Update chat page to use MessageGroup | `/routes/chat/+page.svelte` |
| 2.3 | Update reader page to use MessageGroup | `/routes/reader/+page.svelte` |
| 2.4 | Extract ConfirmationModal | `/lib/components/ConfirmationModal.svelte` |
| 2.5 | Update chat page to use ConfirmationModal | `/routes/chat/+page.svelte` |
| 2.6 | Update reader page to use ConfirmationModal | `/routes/reader/+page.svelte` |
| 2.7 | Extract PersonaDropdown | `/lib/components/PersonaDropdown.svelte` |
| 2.8 | Update both pages to use PersonaDropdown | Both pages |
| 2.9 | Extract InputBar | `/lib/components/InputBar.svelte` |
| 2.10 | Update both pages to use InputBar | Both pages |
| 2.11 | Extract NukeButton | `/lib/components/NukeButton.svelte` |
| 2.12 | Update both pages to use NukeButton | Both pages |

**Verification after each step:** Page renders correctly, all interactions work.

---

### Phase 3: Reorganize Backend

Move existing logic to new locations. Mostly file moves + import updates.

| Step | Task | From | To |
|------|------|------|----|
| 3.1 | Create prompts directory structure | - | `/lib/prompts/personas/`, `/lib/prompts/instructions/`, `/lib/prompts/builders/` |
| 3.2 | Move Gunnar prompt | `/lib/prompts/persona-gunnar.ts` | `/lib/prompts/personas/gunnar.ts` |
| 3.3 | Move Kirby prompt | `/lib/prompts/persona-kirby.ts` | `/lib/prompts/personas/kirby.ts` |
| 3.4 | Move Samara prompt | `/lib/prompts/reader-samara.ts` | `/lib/prompts/personas/samara.ts` |
| 3.5 | Move base instructions | `/lib/prompts/base-instructions.ts` | `/lib/prompts/instructions/base.ts` |
| 3.6 | Create chat instructions | - | `/lib/prompts/instructions/chat.ts` |
| 3.7 | Create reader instructions | - | `/lib/prompts/instructions/reader.ts` |
| 3.8 | Create system prompt builder | - | `/lib/prompts/builders/system-prompt.ts` |
| 3.9 | Update all imports | Various | Various |
| 3.10 | Create calls directory structure | - | `/lib/calls/chat/`, `/lib/calls/reader/`, `/lib/calls/shared/` |
| 3.11 | Extract converse call | `/routes/api/chat/+server.ts` | `/lib/calls/chat/converse.ts` |
| 3.12 | Extract compress call | `/routes/api/chat/+server.ts` | `/lib/calls/chat/compress.ts` |
| 3.13 | Extract describe call | `/routes/api/reader/chat/+server.ts` | `/lib/calls/reader/describe.ts` |
| 3.14 | Extract followup call | `/routes/api/reader/chat/+server.ts` | `/lib/calls/reader/followup.ts` |
| 3.15 | Update API routes to import from /lib/calls | Both API routes | - |

**Verification:** All API endpoints work, streaming works.

---

### Phase 4: Wire Up Capabilities & Modes

Create the capability and mode abstractions.

| Step | Task | Files |
|------|------|-------|
| 4.1 | Create capabilities directory | `/lib/capabilities/` |
| 4.2 | Extract web-search capability | `/lib/capabilities/web-search.ts` |
| 4.3 | Extract context-injection capability | `/lib/capabilities/context-injection.ts` |
| 4.4 | Extract file-reader capability | `/lib/capabilities/file-reader.ts` |
| 4.5 | Create capabilities index | `/lib/capabilities/index.ts` |
| 4.6 | Create chat mode config | `/lib/modes/chat.ts` |
| 4.7 | Create reader mode config | `/lib/modes/reader.ts` |
| 4.8 | Create mode registry | `/lib/modes/registry.ts` |
| 4.9 | Update pages to use mode config | Both pages |

**Verification:** Modes load correctly, capabilities are accessible.

---

### Phase 5: Security & Cleanup

Centralize security, remove dead code.

| Step | Task | Files |
|------|------|-------|
| 5.1 | Create security directory | `/lib/security/` |
| 5.2 | Create auth helper | `/lib/security/auth.ts` |
| 5.3 | Create sanitize helper | `/lib/security/sanitize.ts` |
| 5.4 | Update API routes to use auth helper | All API routes |
| 5.5 | Update components to use sanitize helper | MessageGroup, Reader upload |
| 5.6 | Remove old `/lib/stores/chat.ts` | Delete file |
| 5.7 | Remove old prompt files | Delete files |
| 5.8 | Remove duplicated code from pages | Both pages |

**Verification:** Full app test, security checks work.

---

### Phase 6: Feature Gaps (Optional)

Add missing capabilities to modes.

| Step | Task | Files |
|------|------|-------|
| 6.1 | Add web search to chat mode | `/lib/calls/chat/converse.ts`, `/lib/modes/chat.ts` |
| 6.2 | Add rich context injection to reader | `/lib/calls/reader/followup.ts`, `/lib/modes/reader.ts` |

---

## Risk Mitigation

1. **Each phase results in working code** - No big-bang refactor
2. **Git commits after each step** - Easy rollback
3. **Verify after each component extraction** - Catch regressions early
4. **Keep old files until new ones are proven** - Delete only in Phase 5

---

## Success Criteria

- [ ] Chat page renders and functions identically
- [ ] Reader page renders and functions identically
- [ ] All API endpoints respond correctly
- [ ] Streaming works in both modes
- [ ] No console errors
- [ ] Build succeeds with no type errors
- [ ] Adding a test mode takes < 1 hour

---

## Implementation Log

### Phase 1: Foundation - COMPLETE ✓

**Commit:** `2e7862b` - refactor: Extract MessageGroup + add foundation for shared architecture

Files created:
- `/lib/api/stream-protocol.ts` - SSE event helpers (`emitChunk`, `emitDone`, `emitError`, `sseHeaders`)
- `/lib/api/parse-sse.ts` - Async generator SSE parser for client-side streaming
- `/lib/modes/types.ts` - `ModeConfig` interface with personas, capabilities, scroll config
- `/lib/composables/message-stream.svelte.ts` - Streaming state using Svelte 5 `$state` runes
- `/lib/composables/confirmation.svelte.ts` - Countdown confirmation state
- `/lib/composables/index.ts` - Re-exports

### Phase 2: Extract UI Components - COMPLETE ✓

**Commit:** `5097e4f` - refactor: Extract ConfirmationModal, PersonaDropdown, create InputBar

Files created:
- `/lib/components/MessageGroup.svelte` - Boss + AI message pair with mode-aware accent colors
- `/lib/components/ConfirmationModal.svelte` - Countdown modal for destructive actions
- `/lib/components/PersonaDropdown.svelte` - Persona selector with interactive/static modes
- `/lib/components/InputBar.svelte` - Auto-expanding textarea + send button

Integration:
- Chat page updated to use `MessageGroup`, `ConfirmationModal`, `PersonaDropdown`
- Reader page updated to use `MessageGroup`, `ConfirmationModal`, `PersonaDropdown`
- `InputBar` created but not integrated (layout differences between modes)

**Bug fix:** `0da7489` - fix: Correct Q&A history message pairing in reader mode
- Changed from index-based pairing to role-based iteration
- Fixes display bug where boss/Samara messages were swapped

### Phase 3: Reorganize Backend - COMPLETE ✓

**Prompts restructure:**
- Merged `base-instructions.ts` content into Gunnar and Kirby personas (deleted base file)
- Created `/lib/prompts/personas/` directory
- Moved `persona-gunnar.ts` → `personas/gunnar.ts`
- Moved `persona-kirby.ts` → `personas/kirby.ts`
- Moved `reader-samara.ts` → `personas/samara.ts` (renamed export to `PERSONA_SAMARA`)
- Updated all imports in API routes

**Calls restructure:**
- Created `/lib/calls/` directory structure
- `chat/converse.ts` - Async generator for persona conversation streaming
- `chat/compress.ts` - Artisan cut compression call
- `reader/describe.ts` - Article summary with Brave Search tool use
- `reader/followup.ts` - Q&A follow-up with history + chart support
- Updated `api/chat/+server.ts` to use `converseStream` and `compress`
- Updated `api/reader/process-article/+server.ts` to use `describeStream`
- Updated `api/reader/chat/+server.ts` to use `followupStream`

**Note - Pre-existing type errors (not from refactor):**
- `context-builder.ts`, `chat/+server.ts` - Voyage SDK `data` possibly undefined
- `demo/convert-pdf/+server.ts` - Node spawn options + Uint8Array body type
- `filter-charts/+server.ts` - Anthropic SDK `file_id` source type mismatch
- `chat/+page.server.ts` - `user` possibly null check

### Phase 4: Wire Up Capabilities & Modes - PENDING

### Phase 5: Security & Cleanup - PENDING

### Phase 6: Feature Gaps - PENDING
