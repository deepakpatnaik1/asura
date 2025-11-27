# Final Testing

## To-Do

- [ ] Fix inconsistent chat interface border (reader has right border, chat doesn't)
- [ ] Clear charts/images canvas when paperclip is clicked to upload new article
- [ ] Reposition image close (X) button so it's not behind logout button
- [ ] Remove cost/token tracking (incomplete, inaccurate, not needed)

---

## Rules

1. Address boss out of affection, not hierarchy.
2. Document tests, results, bugs and commits - all in this one file.
3. Diagnose, discuss and only then implement fixes.
4. Defer to boss for all business logic, application logic and UI/UX decisions.

---

## Test 1: Dev Server Starts

**Objective:** Verify app starts after refactoring.

**Result:** PASS

- Vite started in 907ms at http://localhost:5173/
- Settings API responded (user authenticated)
- HMR working

**Warnings (non-blocking):**
- ~40 unused CSS selectors in `chat/+page.svelte`
- ~16 unused CSS selectors in `+layout.svelte`
- A11y warnings in modal components
- Auth: using `getSession()` instead of `getUser()`

---

## Bug 1: Inconsistent Chat Interface Border

**Observation:** Reader mode chat interface has a border on the right side. Chat mode does not.

**Status:** Awaiting decision

---

## Test 2: Settings Persistence

**Objective:** Verify all four dropdown settings persist across browser refresh and dev server restart.

**Dropdowns:**
1. Conversation model
2. Compression model
3. Reader model
4. Embedding model

**Steps:**
1. Open settings, change all four dropdowns
2. Refresh browser - check if values persist
3. Restart dev server - check if values persist

**Result:** PASS (manual verification)

- Browser refresh: Settings persisted
- Dev server restart: Settings persisted

**Code verification:** CONFIRMED

- Settings stored in Supabase `user_settings` table (database-backed)
- `GET /api/settings` fetches from DB
- `PUT /api/settings` writes to DB
- SettingsModal fetches on `onMount`

Persistence is architecturally correct.

---

## Test 3: Basic LLM Functionality (Chat Mode)

**Objective:** Verify AI responds to a simple question in chat mode.

**Persona:** Gunnar (startup mentor)

**Result:** PARTIAL PASS

- Asked Gunnar: "What is an asteroid?"
- With Claude 3.5 Haiku: Markdown formatting was wrong
- Nuked chat, switched to Claude 4.5 Haiku
- With Claude 4.5 Haiku: Formatting appears correct

**Investigation:** Markdown rendering code reviewed

**Findings in `markdown-renderer.ts`:**
1. Line 128: Aggressive asterisk stripping (`cleanHtml.replace(/\*/g, '')`)
2. Lines 72-79: Bold/italic intentionally stripped to plain text
3. Lines 24-28: Tool call spacing fix may create unexpected paragraph breaks

**Root cause hypothesis:** 3.5 Haiku produces less clean markdown that doesn't parse correctly, leaving raw characters that get stripped. 4.5 Haiku produces cleaner markdown.

**Decision:** Monitor across multiple conversations. If 4.5 Haiku formatting is consistently good, no action needed (4.5 Haiku is the default model).

---

## Test 4: Scroll Controls (Chat Mode)

**Objective:** Verify auto-scroll, next turn, and previous turn buttons work correctly.

**Prerequisites:** Multiple message turns in chat

**Tests:**
1. Auto-scroll (play/pause)
2. Next turn button
3. Previous turn button

**Result:** PASS - All scroll controls working correctly

---

**Note:** All testing above is in Chat Mode only. Reader Mode testing to follow.

---

## Audit 1: API Call Plumbing

**Objective:** Verify no accidental/leaked API calls for costly LLM operations.

**Files reviewed:**
- `src/lib/calls/chat/converse.ts` (converseStream)
- `src/lib/calls/chat/compress.ts` (compress)
- `src/routes/api/chat/+server.ts` (trigger points)

**Call 1 (converseStream):**
- Single import in `/api/chat/+server.ts`
- Triggered: POST request only
- Gates: Auth required, message required
- Note: Recursive tool handling may cause multiple API calls (by design for Brave Search)

**Call 2 (compress):**
- Triggered via `setTimeout()` after successful superjournal save
- Gates: Only fires if save succeeded
- Single call per conversation turn

**Voyage Embedding:**
- Triggered after successful journal insert
- Single call per compression

**Result:** PASS - No API call leaks found. All calls properly gated.

---

## Audit 2: Web Search Enabled (Chat Mode)

**Objective:** Verify web search is enabled in chat mode.

**Code verification:**
- `converse.ts:87` - `tools: [BRAVE_SEARCH_TOOL]` passed to API ✓
- `converse.ts:118-134` - Tool use handler executes search ✓
- All personas have web search instruction in prompts ✓

**Result:** PASS - Web search is fully enabled.

**Manual test:** PASS - Works well, very fast!

---

## Reader Mode Testing

---

## Test 5: Article Upload (Reader Mode)

**Objective:** Verify article upload with charts and text works correctly.

**Steps:**
1. Switch to Reader mode
2. Click paperclip to upload article
3. Drop article with charts and text

**Result:** PASS

- Article generated beautifully
- Emerald green accent color looks great in markdown formatting
- Thumbnails render correctly
- Full-size images render correctly

Work of art.

---

## Test 6: Upload New Article While One Is Open

**Objective:** Verify behavior when clicking paperclip with article already loaded.

**Result:** BUG FOUND

- Clicking paperclip clears article content (correct)
- Paste article box appears (correct)
- **BUG:** Charts/images canvas on right side remains populated
- Expected: Charts/images should clear when article clears

---

## Test 7: Retrieve Article from Library (Folder Icon)

**Objective:** Verify folder icon retrieves previously loaded article.

**Result:** PASS

---

## Test 8: Chart Selection and Q&A (Reader Mode)

**Objective:** Verify selecting a thumbnail and asking a question about it works.

**Result:** PASS - Gorgeous.

---

## UI Issue 1: Image Close Button Behind Logout

**Observation:** When full-size image is displayed, the X button (top right) to collapse back to thumbnail is behind the logout button.

**Type:** UI cleanup (not a bug)

---

## Audit 3: Cost/Token Tracking

**Objective:** Verify accuracy of cost calculator in settings.

**Findings:**
- Chat mode Call 1 tracked ✓
- Reader mode: NOT tracked
- Compression (Call 2): NOT tracked
- Voyage embeddings: NOT tracked
- Brave Search: NOT tracked
- Cache discounts: NOT accounted for

**Decision:** Remove entire feature - incomplete, inaccurate, not needed.
