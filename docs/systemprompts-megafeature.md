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

## User Settings Architecture (Single Source of Truth)

### Overview

Model and persona selection are managed through a `user_settings` table in Supabase, which serves as the single source of truth cascading to all parts of the application.

### Database Schema

**Table: `user_settings`**

```sql
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selected_model TEXT NOT NULL REFERENCES models(model_identifier) ON DELETE RESTRICT,
  selected_persona TEXT NOT NULL DEFAULT 'gunnar' CHECK (selected_persona IN ('gunnar', 'kirby')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Single-row constraint (global settings, no user_id - single-user app)
CREATE UNIQUE INDEX idx_user_settings_singleton ON user_settings ((1));

-- Insert default row
INSERT INTO user_settings (selected_model, selected_persona)
VALUES ('accounts/fireworks/models/qwen3-235b-a22b', 'gunnar');
```

**Key Design Decisions:**
- **No `user_id` column** - Single-row global settings (single-user app, no Google Auth yet)
- **Foreign key to `models` table** - Prevents invalid model selection
- **Check constraint** - Only allows 'gunnar' or 'kirby' personas
- **Singleton pattern** - Unique index on constant `(1)` ensures only one row exists
- **Default values** - Qwen3-235B model, Gunnar persona

### Cascade Flow

```
user_settings table (Supabase)
         ↓
Frontend dropdowns read/write
         ↓
Backend APIs read on every request
         ↓
┌────────────────┬─────────────────┬──────────────────┐
│ Chat API       │ File Compressor │ Context Builder  │
│ (Call 1A/1B)   │ (Call 2A/2B/3A) │ (Memory)         │
└────────────────┴─────────────────┴──────────────────┘
```

**Read Points:**
1. **Frontend (+page.svelte)** - Reads on mount, updates on dropdown change
2. **Chat API (+server.ts)** - Reads `selected_model` and `selected_persona` before Call 1A/1B
3. **File Compressor (file-compressor.ts)** - Reads `selected_model` before compression calls
4. **Context Builder (context-builder.ts)** - Reads `selected_persona` for instruction filtering

**Write Points:**
1. **Frontend dropdowns** - Updates table on user selection

### Model Selection Scope

**Universal application:**
- Chat (Call 1A/1B) uses `selected_model`
- File compression (Call 2A/2B/3A/3B) uses `selected_model`
- Same model everywhere, but with different `reasoning_effort` settings:
  - **Chat:** Default reasoning effort (model decides)
  - **File compression:** `reasoning_effort: "none"` (no thinking mode)

**Note:** We don't use a separate `FILE_MODEL` constant. The same model is used universally with programmatic thinking control via API parameter.

---

## Thinking Mode Control (Programmatic `/nothink`)

### Problem

Originally attempted to control thinking mode via prompt prefix `/nothink`, but LLMs can ignore prompt instructions.

### Solution: API Parameter

**Use Fireworks AI's `reasoning_effort` parameter:**

```typescript
const response = await fireworks.chat.completions.create({
  model: selectedModel,
  messages: [...],
  temperature: 0.7,
  max_tokens: 1000,
  reasoning_effort: "none"  // Disables thinking mode programmatically
});
```

**Values:**
- `"none"` - Disable thinking (file compression, faster responses)
- `"low" | "medium" | "high"` - Enable thinking with varying depth
- Omit - Model decides (default for chat)

**Application:**
- **Chat (Call 1A/1B):** Omit parameter (let model think naturally)
- **File compression (Call 2A/2B/3A/3B):** Set `reasoning_effort: "none"` (speed over reasoning)

**Benefits:**
- API enforces it (LLM cannot ignore)
- Cleaner prompts (no `/nothink` clutter)
- Works with OpenAI SDK compatibility

---

## Smart Persona Switching UX

### Behavior 1: Type Persona Name → Auto-Switch Dropdown

When user types "gunnar" or "kirby" at the start of their message:
- Dropdown instantly switches to that persona
- Persona name **stays in input field** (not removed)
- Example: User types "Gunnar, what's the weather?" → Dropdown shows Gunnar, input unchanged

**Implementation:**
```typescript
// Watch input for persona names at start (case-insensitive)
$effect(() => {
  const normalized = inputMessage.trim().toLowerCase();
  if (normalized.startsWith('gunnar')) {
    selectedPersona = 'gunnar';
  } else if (normalized.startsWith('kirby')) {
    selectedPersona = 'kirby';
  }
});
```

**Design rationale:** Keeping persona name in message provides natural conversational feel ("Gunnar, help me with...") without forcing removal.

### Behavior 2: Click Dropdown → Insert Name in Input

When user clicks dropdown to switch persona:
- Dropdown switches to selected persona
- Persona name gets inserted into input field with comma: `"Gunnar, "`
- Cursor remains in active focus so user can continue typing immediately

**Implementation:**
```typescript
function selectPersona(persona: 'gunnar' | 'kirby') {
  selectedPersona = persona;
  const name = persona.charAt(0).toUpperCase() + persona.slice(1);
  inputMessage = `${name}, ${inputMessage}`;
  // Input maintains focus automatically in Svelte
}
```

**Design rationale:** Reduces friction - user can switch persona and start typing in one fluid motion.

---

## Dynamic Persona Display in Message History

### Current Issue

Message history hardcodes "Ananya" in loading state and uses hardcoded persona in completed messages.

### Solution

**Display actual `persona_name` from message data:**

Line 326 in `+page.svelte`:
```typescript
// Current (hardcoded)
<span class="message-label ai-label">Ananya</span>

// Fixed (dynamic)
<span class="message-label ai-label">
  {msg.persona_name.charAt(0).toUpperCase() + msg.persona_name.slice(1)}
</span>
```

Line 361 in loading state:
```typescript
// Current (hardcoded)
<span class="message-label ai-label">Ananya</span>

// Fixed (dynamic)
<span class="message-label ai-label">
  {selectedPersona.charAt(0).toUpperCase() + selectedPersona.slice(1)}
</span>
```

**Data flow:**
1. User sends message with `selectedPersona` from dropdown
2. Backend saves to `superjournal` with correct `persona_name`
3. Frontend displays capitalized persona name from message data

---

## Implementation Checklist

### Phase 0: Database Setup
- [ ] Create `user_settings` table with singleton constraint
- [ ] Add foreign key to `models(model_identifier)`
- [ ] Insert default row (Qwen3-235B, gunnar)

### Phase 1: Remove `/nothink` Prefixes
- [ ] Update `file-compressor.ts` to use `reasoning_effort: "none"` instead of `/nothink` prefix
- [ ] Remove `/nothink` from all imported prompts (already done in `src/lib/prompts/`)
- [ ] Test file compression still works

### Phase 2: Backend - Read from user_settings
- [ ] Update `chat/+server.ts` to read `selected_model` and `selected_persona` from `user_settings`
- [ ] Update `file-compressor.ts` to read `selected_model` from `user_settings`
- [ ] Update `context-builder.ts` default parameter to read from `user_settings`
- [ ] Remove hardcoded defaults (`'ananya'` → read from DB)

### Phase 3: Frontend - Functional Dropdowns
- [ ] Add `selectedPersona` state variable in `+page.svelte`
- [ ] Add `selectedModel` state variable in `+page.svelte`
- [ ] Make model dropdown functional (read/write `user_settings.selected_model`)
- [ ] Make persona dropdown functional (read/write `user_settings.selected_persona`)
- [ ] Update `sendMessage()` in `chat.ts` to accept persona parameter
- [ ] Pass `selectedPersona` to `sendMessage()` from `+page.svelte`

### Phase 4: Smart Persona Switching UX
- [ ] Implement auto-switch on typing persona name
- [ ] Implement name insertion on dropdown click
- [ ] Test both behaviors work smoothly

### Phase 5: Dynamic Persona Display
- [ ] Update message history to show actual `persona_name` from data
- [ ] Update loading state to show `selectedPersona`
- [ ] Remove all hardcoded "Ananya" references

### Phase 6: Migrate Prompts
- [ ] Import prompts from `$lib/prompts` in `file-compressor.ts`
- [ ] Import prompts from `$lib/prompts` in `chat/+server.ts`
- [ ] Delete local prompt definitions
- [ ] Update prompt references

### Phase 7: Testing
- [ ] Test model switching persists across page reloads
- [ ] Test persona switching persists across page reloads
- [ ] Test file upload uses correct model with `reasoning_effort: "none"`
- [ ] Test chat uses correct model and persona
- [ ] Test smart persona switching (typing + dropdown)
- [ ] Test message history shows correct persona names
- [ ] Nuke database and verify defaults work

---

## Notes
