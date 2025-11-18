# System Prompts Integration Analysis

**Date:** 2025-11-15
**Branch:** systemprompts-megafeature
**Status:** Planning Phase - Ready for Review

---

## Executive Summary

System prompts have been extracted into modular TypeScript files (`src/lib/prompts/`). Integration requires:
1. **Backend migration** - Update 2 files to import from new prompt modules
2. **Frontend updates** - Remove hardcoded "ananya" persona, enable persona selection
3. **Breaking changes** - Persona system reduced from 6 to 2 (intentional)

---

## Files Requiring Changes

### Backend Files (2)

#### 1. `/Users/d.patnaik/code/asura/src/lib/file-compressor.ts`

**Current State:**
- Lines 99-236: `MODIFIED_CALL_2A_PROMPT` - File detail chunk compression (has `/nothink` prefix)
- Lines 242-329: `CHUNK_0_COMPRESSION_PROMPT` - File overview compression (has `/nothink` prefix)
- Lines 335-355: `CHUNK_0_CALL_2B_PROMPT` - Overview verification (has `/nothink` prefix)
- Lines 361-378: `MODIFIED_CALL_2B_PROMPT` - Detail verification (has `/nothink` prefix)

**Changes Required:**
1. Add import (after line 3):
   ```typescript
   import { MODIFIED_CALL2A_PROMPT, MODIFIED_CALL2B_PROMPT, CALL3A_PROMPT, CALL3B_PROMPT } from '$lib/prompts';
   ```
2. Delete lines 99-378 (all 4 prompt definitions)
3. Update line 623: `CHUNK_0_COMPRESSION_PROMPT` → `CALL3A_PROMPT`
4. Update line 627: `CHUNK_0_CALL_2B_PROMPT` → `CALL3B_PROMPT`
5. Update lines 695-696: Export new constant names

**CRITICAL ISSUE - /nothink Prefix:**
- Existing prompts have `/nothink` prefix included in string
- New prompt files do NOT include `/nothink` prefix
- **Solution:** Prepend `/nothink\n\n` when using imported prompts

**Updated Usage Pattern:**
```typescript
const call2APrompt = chunkIndex === 0
  ? `/nothink\n\n${CALL3A_PROMPT}`      // Chunk 0 overview
  : `/nothink\n\n${MODIFIED_CALL2A_PROMPT}`;  // Detail chunks

const call2BPrompt = chunkIndex === 0
  ? `/nothink\n\n${CALL3B_PROMPT}`
  : `/nothink\n\n${MODIFIED_CALL2B_PROMPT}`;
```

---

#### 2. `/Users/d.patnaik/code/asura/src/routes/api/chat/+server.ts`

**Current State:**
- Lines 21-204: `CALL2A_PROMPT` - Chat compression (NO `/nothink` prefix)
- Lines 206-213: `CALL2B_PROMPT` - Chat verification (NO `/nothink` prefix)
- Line 185: Validates `persona_name` against 6 personas: `gunnar, samara, kirby, stefan, vlad, or ananya`
- Line 198: Same validation in CRITICAL RULES
- Line 366: Default persona = `'ananya'`
- No BASE_INSTRUCTIONS, CALL1A_PROMPT, CALL1B_PROMPT imports (not used yet - future implementation)

**Changes Required:**
1. Add import (after line 9):
   ```typescript
   import { CALL2A_PROMPT, CALL2B_PROMPT } from '$lib/prompts';
   ```
2. Delete lines 21-213 (both prompt definitions)
3. **BREAKING CHANGE:** Update persona validation to new 2-persona system
4. Update default persona from `'ananya'` → `'gunnar'`

**Persona Validation Changes:**

Current (line 185 in CALL2A_PROMPT):
```
"persona_name": "[Exact name: gunnar, samara, kirby, stefan, vlad, or ananya - lowercase]",
```

New:
```
"persona_name": "[Exact name: gunnar or kirby - lowercase]",
```

Current (line 198 in CALL2A_PROMPT):
```
– persona_name must be lowercase and exact (gunnar, samara, kirby, stefan, vlad, or ananya)
```

New:
```
– persona_name must be lowercase and exact (gunnar or kirby)
```

**Note:** CALL2A_PROMPT and CALL2B_PROMPT already updated in new prompt files - just need to import them.

---

#### 3. `/Users/d.patnaik/code/asura/src/lib/context-builder.ts`

**Current State:**
- Line 59: Default persona parameter = `'ananya'`
- Used by chat API to build context for Call 1A/1B

**Changes Required:**
1. Update line 59: Change default `personaName: string = 'ananya'` → `personaName: string = 'gunnar'`

**Impact:** Low - only affects default value when no persona specified

---

### Frontend Files (2)

#### 4. `/Users/d.patnaik/code/asura/src/routes/+page.svelte`

**Current State - Hardcoded "ananya" references:**

1. **Line 81:** Hardcoded persona in message object
   ```typescript
   persona_name: 'ananya',
   ```

2. **Line 361:** Hardcoded in loading state UI
   ```html
   <span class="message-label ai-label">Ananya</span>
   ```

3. **Line 423:** Static display in persona dropdown
   ```html
   <span class="persona-name">Gunnar</span>
   ```
   **Note:** This shows "Gunnar" but doesn't actually send it to backend!

**Changes Required:**

1. **Add persona state variable:**
   ```typescript
   let selectedPersona = $state<'gunnar' | 'kirby'>('gunnar');
   ```

2. **Update line 81 to use selected persona:**
   ```typescript
   persona_name: selectedPersona,
   ```

3. **Update line 361 to use selected persona:**
   ```html
   <span class="message-label ai-label">{selectedPersona.charAt(0).toUpperCase() + selectedPersona.slice(1)}</span>
   ```

4. **Make persona dropdown functional (replace lines 422-425):**
   ```html
   <div class="persona-dropdown" onclick={() => selectedPersona = selectedPersona === 'gunnar' ? 'kirby' : 'gunnar'}>
       <span class="persona-name">{selectedPersona.charAt(0).toUpperCase() + selectedPersona.slice(1)}</span>
       <Icon src={LuChevronDown} size="11" />
   </div>
   ```

5. **Pass persona to sendMessage():**
   Current (line 70):
   ```typescript
   await sendMessage(message);
   ```

   New:
   ```typescript
   await sendMessage(message, selectedPersona);
   ```

---

#### 5. `/Users/d.patnaik/code/asura/src/lib/stores/chat.ts`

**Current State:**
- Line 13: `sendMessage()` function signature only accepts `userMessage: string`
- Line 38: POST body only sends `{ message: userMessage }`
- No persona parameter

**Changes Required:**

1. **Update function signature (line 13):**
   ```typescript
   export async function sendMessage(userMessage: string, persona: 'gunnar' | 'kirby' = 'gunnar'): Promise<void> {
   ```

2. **Update POST body (line 37-38):**
   ```typescript
   body: JSON.stringify({ message: userMessage, persona })
   ```

---

## Breaking Changes Summary

### 1. Persona System Reduction (6 → 2)

**Old personas (REMOVED):**
- `ananya` - Intellectual companion → merged into Gunnar
- `vlad` - First principles critic → merged into Gunnar
- `stefan` - Finance expert → merged into Gunnar
- `samara` - Emotional processing → merged into Gunnar

**New personas (ACTIVE):**
- `gunnar` - Complete thinking partner (absorbed 4 personas)
- `kirby` - Guerrilla marketer (unchanged)

**Impact:**
- Existing journal entries with old personas will remain in database (data not touched)
- New messages to old personas will be **rejected** by validation
- Default persona changes from `ananya` → `gunnar`
- Frontend persona selection needs to be implemented (currently just displays "Gunnar")

### 2. Data Migration Strategy

**User confirmed:** "Don't worry about existing data. We will be nuking all user data anyway."

**Implication:** No need for data migration scripts - fresh start with new 2-persona system.

---

## Testing Plan

### Phase 1: Backend Integration
1. Migrate file-compressor.ts prompts
2. Test file upload with 10MB PDF
3. Verify chunk compression quality (Chunk 0 + detail chunks)
4. Check `/nothink` prefix is correctly applied

### Phase 2: Chat Integration
1. Migrate chat/+server.ts prompts
2. Update context-builder.ts default
3. Test chat with default persona (gunnar)
4. Verify CALL2A/2B compression works with new prompts

### Phase 3: Frontend Updates
1. Add persona state variable
2. Make persona dropdown functional
3. Update sendMessage() to pass persona
4. Test switching between gunnar/kirby
5. Verify persona name displays correctly in UI

### Phase 4: End-to-End Validation
1. Upload file → verify compression
2. Send message to Gunnar → verify response
3. Send message to Kirby → verify response
4. Switch personas mid-conversation → verify works
5. Nuke database → verify clean slate

---

## Risk Assessment

### High Risk
- **None** - User confirmed data nuke, no migration needed

### Medium Risk
1. **Frontend persona hardcoding**
   - Currently displays "Gunnar" but sends "ananya" to backend
   - **Mitigation:** Implement functional persona dropdown (5 lines of code)

2. **/nothink prefix handling**
   - New prompts don't include prefix, code expects it
   - **Mitigation:** Prepend at usage site in file-compressor.ts

### Low Risk
1. **Default persona change**
   - Backend defaults from ananya → gunnar
   - **Mitigation:** Intentional breaking change, acceptable

---

## Implementation Order

1. **Backend prompts** (file-compressor.ts + chat/+server.ts)
2. **Backend defaults** (context-builder.ts)
3. **Frontend persona selection** (+page.svelte + chat.ts)
4. **Testing** (file upload, chat, persona switching)
5. **Commit & Document**

---

## Questions for User

1. **Persona dropdown UX:** Simple toggle (Gunnar ↔ Kirby) or full dropdown menu?
2. **Model dropdown:** Also hardcoded "Qwen 2.5 32B" - should we make this functional too?
3. **Verification approach:** Should I make changes sequentially (commit per phase) or all at once?

---

## Next Steps

**Awaiting user approval to proceed with:**
1. Backend integration (file-compressor.ts, chat/+server.ts, context-builder.ts)
2. Frontend persona selection implementation (+page.svelte, chat.ts)
3. Testing plan execution
