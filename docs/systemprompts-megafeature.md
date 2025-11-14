# System Prompts Megafeature

**Branch:** `systemprompts-megafeature`
**Parent Branch:** `file-megafeature`
**Created:** 2025-11-14

---

## Overview

Consolidate all system prompts across entire app into single `system-prompts.ts` file with precise wording.

---

## Goals

**Primary:** Single source of truth for all system prompts used in app.

**Requirements:**
1. All prompts in one file: `src/lib/system-prompts.ts`
2. Precise, unambiguous wording for each prompt
3. Replace hardcoded prompts scattered across codebase
4. Maintain existing functionality (no behavior changes)

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

**Source:** `docs/⭐ system-prompts.md` contains all prompts in markdown format.
**Target:** `src/lib/system-prompts.ts` - centralized TypeScript exports.

### Phase 1: Create System Prompts File

Create `src/lib/system-prompts.ts` with all prompts exported as named constants:
- Base Instructions (1)
- Persona Profiles (6): Gunnar, Vlad, Kirby, Stefan, Ananya, Samara
- Call 1B Prompt (1)
- Chat Compression: Call 2A, Call 2B (2)
- File Compression: Modified Call 2A, Modified Call 2B, Call 3A, Call 3B (4)

All prompts extracted verbatim from `docs/⭐ system-prompts.md` - zero wording changes.

### Phase 2: Migrate File Compression Prompts

**File:** `src/lib/file-compressor.ts`

1. Add import: `import { MODIFIED_CALL_2A_PROMPT, MODIFIED_CALL_2B_PROMPT, CALL_3A_PROMPT, CALL_3B_PROMPT } from '$lib/system-prompts';`
2. Delete local prompt definitions
3. Update references to use imported constants

### Phase 3: Migrate Chat Compression Prompts

**File:** `src/routes/api/chat/+server.ts`

1. Add import: `import { CALL2A_PROMPT, CALL2B_PROMPT } from '$lib/system-prompts';`
2. Delete local CALL2A_PROMPT and CALL2B_PROMPT definitions
3. Update references to use imported constants

### Phase 4: Verification

1. Restart dev server (server-side changes require full restart)
2. Test file upload functionality
3. Test chat functionality
4. Verify zero behavior changes

### Phase 5: Commit

Document completion and create commit with migration changes.

---

## Constraints

- Zero wording changes (extract verbatim)
- Zero behavior changes (same imports, same usage)
- Single-user app (no auth/multi-user logic)
- Remote Supabase (not local)

---

## Notes
