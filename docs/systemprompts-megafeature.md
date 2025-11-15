# System Prompts Megafeature

**Branch:** `systemprompts-megafeature`
**Parent Branch:** `file-megafeature`
**Created:** 2025-11-14

---

## Overview

Consolidate all system prompts across entire app into modular TypeScript files with precise wording.

---

## Goals

**Primary:** Single source of truth for all system prompts used in app.

**Requirements:**
1. All prompts in separate files under `src/lib/prompts/` directory
2. Precise, unambiguous wording for each prompt
3. Replace hardcoded prompts scattered across codebase
4. Maintain existing functionality (no behavior changes)
5. Central index file (`index.ts`) for convenient imports

---

## User Requirements & Understanding

There are broadly two kinds of system prompts used in this project: one for conversations and the other for files.

### Conversation System Prompts

**Call 1A prompt:** This prompt tells the LLM model that it is about to receive the base instructions, the persona-specific profile, the memory context and the user query and that it should answer the user query. The memory context includes the last five full turns, the last hundred compressed turns, all decision arcs going back to the beginning of the session as well as the current timestamp to facilitate smooth human-like conversation continuity.

**Call 1B prompt:** This prompt repeats everything said in the call 1A prompt. It further adds that the LLM model is going to receive its previous response to the same user query and that it should rework the response into a higher quality one. Give it more personality, make it more actionable, and less generic.

**Call 2A Prompt:** This prompt is already worded very well in the system prompts.md file.

**Call 2B Prompt:** This prompt is also very well worded in the system prompts.md file.

**Persona Prompts:** The persona prompts are already well worded in system prompts.md.

### File System Prompts

**Modified Call 2A:** Prompt to generate an artisan cut of each chunk.

**Modified Call 2B:** Prompt to verify the quality of the artisan cut of each chunk.

**Call 3A:** Prompt to generate an overview of the file.

**Call 3B:** Prompt to verify the quality of the overview of the file.

---

## Implementation Plan

**Source:** `docs/⭐️ system-prompts/` contains all prompts in markdown format.
**Target:** `src/lib/prompts/` - modular TypeScript files.

### Phase 1: Create System Prompts Directory Structure ✅

Created `src/lib/prompts/` with separate files:

**Base & Personas:**
- `base-instructions.ts` - Core behavioral instructions
- `persona-gunnar.ts` - Complete thinking partner
- `persona-kirby.ts` - Guerrilla marketer

**Call 1A/1B (Chat):**
- `call1a.ts` - Initial response generation
- `call1b.ts` - Response refinement & verification

**Call 2A/2B (Chat Compression):**
- `call2a.ts` - Artisan cut compression
- `call2b.ts` - Compression verification

**Call 3A/3B (File Overview):**
- `call3a.ts` - File overview compression (Chunk 0)
- `call3b.ts` - Overview verification

**Modified Call 2A/2B (File Details):**
- `modified-call2a.ts` - Detail chunk compression (Chunk 1+)
- `modified-call2b.ts` - Detail verification

**Index:**
- `index.ts` - Central exports for convenient imports

**Persona Consolidation:**
Originally had 6 personas (Gunnar, Vlad, Kirby, Stefan, Ananya, Samara). After implementing A-B prompting architecture, reduced to 2 personas:
- Vlad (first principles) → merged into Gunnar
- Stefan (finance) → merged into Gunnar
- Samara (emotional processing) → merged into Gunnar
- Ananya (intellectual companion) → merged into Gunnar
- Kirby retained as specialized guerrilla marketing persona

All prompts extracted verbatim from `docs/⭐️ system-prompts/` markdown files.

### Phase 2: Migrate File Compression Prompts

**File:** `src/lib/file-compressor.ts`

1. Add import: `import { MODIFIED_CALL2A_PROMPT, MODIFIED_CALL2B_PROMPT, CALL3A_PROMPT, CALL3B_PROMPT } from '$lib/prompts';`
2. Delete local prompt definitions (currently named: DETAIL_CHUNK_COMPRESSION_PROMPT, DETAIL_CHUNK_CALL_2B_PROMPT, CHUNK_0_COMPRESSION_PROMPT, CHUNK_0_CALL_2B_PROMPT)
3. Update references to use imported constants

### Phase 3: Migrate Chat System Prompts

**File:** `src/routes/api/chat/+server.ts`

1. Add imports:
   ```typescript
   import {
     BASE_INSTRUCTIONS,
     PERSONA_GUNNAR,
     PERSONA_KIRBY,
     CALL1A_PROMPT,
     CALL1B_PROMPT,
     CALL2A_PROMPT,
     CALL2B_PROMPT
   } from '$lib/prompts';
   ```
2. Delete hardcoded prompt definitions
3. Update references to use imported constants
4. Remove obsolete persona references (Vlad, Stefan, Samara, Ananya)

### Phase 4: Verification

1. Restart dev server (server-side changes require full restart)
2. Test file upload functionality
3. Test chat functionality with both personas
4. Verify zero behavior changes (compression quality, response quality)

### Phase 5: Commit

Document completion and create commit with migration changes.

---

## Constraints

- Zero wording changes (extract verbatim)
- Zero behavior changes (same imports, same usage)
- Single-user app (no auth/multi-user logic)
- Remote Supabase (not local)

---

## A-B Prompt Architecture (CRITICAL)

All prompts follow an A-B pattern where the B call verifies the A call's output against A's rules.

### Four A-B Prompt Pairs

1. **CALL1A / CALL1B** - Chat responses (generate → refine)
2. **CALL2A / CALL2B** - Chat compression (compress → verify)
3. **MODIFIED_CALL_2A / MODIFIED_CALL_2B** - File detail chunks (compress → verify)
4. **CALL_3A / CALL_3B** - File overview/Chunk 0 (compress → verify)

### How A-B Calls Work

**The A Call:**
- Receives: User query (or file content)
- Receives: Rules for how to respond
- Generates: Response according to those rules

**The B Call:**
- Receives: User query (or file content) - **same input as A**
- Receives: The complete A prompt - **so it knows what rules were applied**
- Receives: The A call's output - **what needs to be verified**
- Receives: Additional verification instructions (the B prompt)
- Generates: Refined/verified response

### Implementation Pattern

When calling B prompts, the message structure must be:

```
[A PROMPT - the rules]

[Original input - user query or file content]

[A's output - what to verify]

[B PROMPT - verification instructions]
```

**Example for MODIFIED_CALL_2B:**
```
[MODIFIED_CALL_2A_PROMPT - complete artisan cut rules]

[File chunk content]

[JSON output from Call 2A]

[MODIFIED_CALL_2B_PROMPT - verification instructions]
```

This ensures the B call can verify whether the A call properly followed its own rules.

### Why This Matters

The B prompt alone says "verify against these rules" but doesn't contain the full rules - those are in the A prompt. The B call needs to see both prompts to do its job.

---

## Progress

### Completed ✅

**Phase 1: System Prompts Directory Structure** (2025-11-15)
- Created `src/lib/prompts/` directory
- Extracted all 11 prompt files from markdown docs:
  - Base instructions and 2 personas (was 6, consolidated to 2)
  - 4 A-B prompt pairs (8 total call prompts)
  - Central index.ts for exports
- Prompts are now modular, version-controlled TypeScript constants
- Documented persona consolidation rationale in commit history

### In Progress

**Phase 2: Migrate File Compression Prompts**
- Next: Update `src/lib/file-compressor.ts` to import from `$lib/prompts`

**Phase 3: Migrate Chat System Prompts**
- Next: Update `src/routes/api/chat/+server.ts` to import from `$lib/prompts`

---

## File Structure

```
src/lib/prompts/
├── index.ts                    # Central exports
├── base-instructions.ts        # Core behavioral rules
├── persona-gunnar.ts          # Complete thinking partner
├── persona-kirby.ts           # Guerrilla marketer
├── call1a.ts                  # Initial chat response
├── call1b.ts                  # Chat response verification
├── call2a.ts                  # Chat compression
├── call2b.ts                  # Chat compression verification
├── call3a.ts                  # File overview compression (Chunk 0)
├── call3b.ts                  # File overview verification
├── modified-call2a.ts         # File detail compression (Chunk 1+)
└── modified-call2b.ts         # File detail verification
```

**Import Usage:**
```typescript
// Option 1: Import from index (recommended)
import { CALL2A_PROMPT, CALL2B_PROMPT } from '$lib/prompts';

// Option 2: Import from specific file
import { CALL2A_PROMPT } from '$lib/prompts/call2a';
```

---

## Notes
