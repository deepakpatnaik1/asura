# Systematic Testing

## Test 1: App Running After Refactor

**Objective:** Verify the application starts and loads after Phase 6 refactoring.

**Steps:**
1. Navigate to http://localhost:5173/
2. Confirm page loads without errors
3. Check browser console for JavaScript errors

**Expected:** App loads, no critical errors.

**Result:** ✅ PASS - App loads and runs correctly.

---

## Test 2: Nuke Buttons in Both Modes

**Objective:** Verify nuke functionality works in chat and reader modes after confirmation composable refactor.

**Steps:**
1. Go to Chat mode (/chat)
2. Click Nuke button
3. Verify countdown modal appears
4. Cancel or let it complete
5. Go to Reader mode (/reader)
6. Click Nuke button
7. Verify countdown modal appears
8. Cancel or let it complete

**Expected:** Both modes show confirmation modal with countdown, nuke executes on completion.

**Result:** ✅ PASS - Both chat and reader nuke buttons work correctly.

---

## Test 3: Basic AI Conversation in Both Modes

**Objective:** Verify AI responds to simple messages after converseStream refactor.

**Steps:**
1. Go to Chat mode (/chat)
2. Send "hi" message
3. Verify AI response streams correctly
4. Go to Reader mode (/reader)
5. Load an article
6. Send "hi" message
7. Verify Samara responds

**Expected:** Both modes receive and display streamed AI responses.

**Result:**
- ✅ Chat mode: PASS - Gunnar responded to "hi"
- ⚠️ Reader mode: BY DESIGN - Message blocked without article loaded

**Design Question Raised:**
Reader mode currently requires an article before allowing chat. Should users be able to chat with Samara without an article? No facility exists for this currently. Needs product decision.

---

## Review 1: System Prompts

**Calls (`/lib/calls/`):**
| Call | File | Prompt Used | Purpose |
|------|------|-------------|---------|
| converse | `chat/converse.ts` | `call1.ts` | Main persona conversation (streaming, web search) |
| compress | `chat/compress.ts` | `call2.ts` | Artisan cut compression to journal |
| describe | `reader/describe.ts` | inline | Article summary with web search |
| followup | `reader/followup.ts` | Samara persona | Q&A on article with history |

**Prompt Constants (`/lib/prompts/`):**
| File | Used By | Purpose |
|------|---------|---------|
| `call1.ts` | converse | Explains memory context structure to AI |
| `call2.ts` | compress | Artisan cut rules, JSON output format |

**Persona Prompts:**
| Persona | File | Role | Key Traits |
|---------|------|------|------------|
| Gunnar | `personas/gunnar.ts` | Startup mentor | Best friend, challenges assumptions, detects bullshit, web search enabled |
| Kirby | `personas/kirby.ts` | Guerrilla marketer | Bold ideas, boundary-pushing, wild/energetic |
| Samara | `personas/samara.ts` | E-reader companion | Executive summaries, demystifies concepts, web search enabled |

**Notes:**

**Code Cleanliness Audit:**

### Issue 1: Inconsistent Naming

| Current | Should Be |
|---------|-----------|
| `/lib/prompts/call1.ts` | `/lib/prompts/converse.ts` |
| `/lib/prompts/call2.ts` | `/lib/prompts/compress.ts` |

### Issue 2: Inline Prompts in Call Files

All prompt text should be in `/lib/prompts/`. Found inline prompts in:

**`describe.ts:39-43`** - Article summary request:
```
`Here is an article titled "${articleTitle}". Please provide an educational summary.
Use the web search tool as needed to understand recent context.
<article>${articleHtml}</article>`
```

**`followup.ts:56-59`** - Article context injection:
```
`Here is an article titled "${articleTitle}":\n\n<article>\n${articleHtml}\n</article>`
`\n\nHere is my previous summary of this article:\n\n${previousSummary}`
```

**`followup.ts:84`** - Chart reference prefix:
```
`[Referring to chart ${(chartIndex ?? 0) + 1}] ${message}`
```

**`compress.ts:72`** - User message format:
```
`User message: ${userMessage}\n\nPersona (${personaName}) response: ${aiResponse}`
```

**`converse.ts:62`** - Context separator:
```
`${context}--- CURRENT QUERY ---\n${message}`
```

### What's Already Correct

- `converse.ts` imports `CALL1_PROMPT` ✓
- `compress.ts` imports `CALL2_PROMPT` ✓
- `describe.ts` imports `PERSONA_SAMARA` ✓
- `followup.ts` imports `PERSONA_SAMARA` ✓

### Action Items - COMPLETE ✓

**Commit:** `285ee43` - refactor: Clean up prompt architecture

- [x] Rename `call1.ts` → `converse.ts`
- [x] Rename `call2.ts` → `compress.ts`
- [x] Create `/lib/prompts/templates/` for reusable prompt fragments
- [x] Extract `describeUserPrompt()` template
- [x] Extract `followupArticleContext()` template
- [x] Extract `followupChartPrefix()` template
- [x] Extract `compressUserFormat()` template
- [x] Extract `converseUserPrompt()` template

---

## Review 2: Prompt Text Audit

**Objective:** Manual review of all prompt text for quality, consistency, and effectiveness.

**Status:** IN PROGRESS

**Files to Review:**
- [ ] `/lib/prompts/converse.ts` - Memory context instructions
- [ ] `/lib/prompts/compress.ts` - Artisan cut rules
- [ ] `/lib/prompts/personas/gunnar.ts` - Startup mentor persona
- [ ] `/lib/prompts/personas/kirby.ts` - Guerrilla marketer persona
- [ ] `/lib/prompts/personas/samara.ts` - E-reader companion persona
- [ ] `/lib/prompts/templates/index.ts` - Reusable prompt fragments

**Notes:**
