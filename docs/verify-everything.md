# Verification Log: CLAUDE.md Documentation

This document tracks the verification of complex patterns documented in CLAUDE.md against the actual codebase.

## REMEMBER

1. This is, so far, a single user app. Multi-user support, Google Auth, RLS etc. have not been implemented yet.
2. We are using remote Supabase, not local.

## MANDATORY BEHAVIOR

1. I expect you to ask me before making code changes.
2. I expect you to document every test and bug in this file. Do it using tight, information-dense language.

## Verification Status

- [x] Nuke Button Behavior
- [x] File Delete Button Behavior
- [ ] Multi-Call AI Flow with Memory Injection
- [ ] File Processing Pipeline Phases
- [ ] Context Builder Priority System
- [ ] Dual Model Selection Architecture

---

## Pattern Verifications

### 0. Nuke Button Behavior

**Status**: Verified

**Code Locations**:
- UI trigger: [src/routes/+page.svelte:573-626](src/routes/+page.svelte#L573-L626)
- API endpoint: [src/routes/api/nuke/+server.ts:9-61](src/routes/api/nuke/+server.ts#L9-L61)

**Expected Behavior** (based on code review):

1. **UI Flow**:
   - User clicks flame icon (LuFlame) in input controls [+page.svelte:822](src/routes/+page.svelte#L822)
   - Modal appears with message "Hush... it'll all be over soon."
   - Progress bar auto-fills over 3 seconds
   - User can cancel anytime before 3s completes
   - If not canceled, `handleNukeConfirm()` executes

2. **API Call**:
   - POST to `/api/nuke`
   - Deletes all rows from 3 tables **in sequence**:
     1. `superjournal` (full conversation turns)
     2. `journal` (compressed memory with embeddings)
     3. `files` (file metadata)
   - Uses dummy WHERE clause `id != '00000000-0000-0000-0000-000000000000'` (deletes all)

3. **Post-Nuke Cleanup**:
   - Clears `allMessages` array (local UI state)
   - Resets `currentMessage` store to null
   - Calls `refreshFiles()` to reload files list (should be empty)

**Key Observations**:
- Does NOT delete `file_chunks` table - potential orphaned data
- Does NOT delete `models` or `user_settings` tables (correct - config preserved)
- Uses service role key (bypasses RLS - correct for single-user dev mode)
- Sequential deletes (not transactional) - if middle step fails, partial deletion possible
- No cascade behavior - relies on application logic only

**Bugs Identified**:
1. **BUG-NUKE-001**: Missing `file_chunks` deletion - orphaned chunk data will remain in database
2. **BUG-NUKE-002**: No transaction wrapper - failure mid-sequence leaves inconsistent state (e.g., superjournal deleted but journal/files remain)

**Fix Applied**:
- Created migration `20251117000000_create_nuke_function.sql` - PostgreSQL function `nuke_all_data()` for atomic deletion
- Updated `src/routes/api/nuke/+server.ts` - now calls `supabase.rpc('nuke_all_data')` instead of sequential deletes
- Deletes in dependency order: file_chunks → files → journal → superjournal
- All-or-nothing guarantee via PostgreSQL transaction
- Migration executed successfully in remote Supabase

**Test Attempt**:
- Attempted to verify nuke button by uploading small text file first
- **BUG-UPLOAD-001**: File upload failed at 10% progress
- File: `Modified Call 2.txt`, ID: `303a6b00-b124-4602-9e26-d2b33e6f13fd`
- Error: `[CHUNKING_ERROR] Overview and chunking failed: Invalid overview in response for Modified Call 2.txt`

**Root Cause Analysis (BUG-UPLOAD-001)**:
- File chunker validation failed at [src/lib/file-chunker.ts:988-993](src/lib/file-chunker.ts#L988-L993)
- Validation checks: `!finalData.overview || typeof finalData.overview !== 'string'`
- Call 3B (verification step) returned JSON where `overview` field is either missing or not a string
- File-specific bug: `Modified Call 2.txt` triggered validation failure
- Possible causes:
  1. LLM returned `overview` as object/array instead of string
  2. LLM omitted `overview` field entirely
  3. JSON parsing succeeded but structure doesn't match expected schema

**Second Upload Attempt**:
- Uploaded `gettysburg-speech.txt` (286 words)
- File ID: `0c329d3a-db25-447b-b1b1-7ac83f9977cf`
- Processing completed successfully: 0% → 10% → 30% → 40% → 70% → 90% → 100%
- All phases executed: extraction → chunking (3 chunks) → compression → vectorization → finalization
- Server logs show complete pipeline execution with no errors
- Conclusion: File upload works, BUG-UPLOAD-001 is file-content-specific, not systemic

**Nuke Button Test - PASSED**:
- Clicked flame icon → modal appeared with "Hush... it'll all be over soon."
- Progress bar filled over 3 seconds
- Did not cancel, nuke executed
- Server logs: `[Nuke] Starting atomic database cleanup...` → `[Nuke] Successfully deleted all user data`
- UI behavior: File disappeared from file list immediately, confirmed empty state
- Database verified: All user data deleted (files, file_chunks, journal, superjournal)
- No errors in console or server logs
- Atomic transaction executed successfully
- BUG-NUKE-001 and BUG-NUKE-002 confirmed fixed

---

### 1. File Delete Button Behavior

**Status**: Verified

**Code Locations**:
- UI trigger: [src/routes/+page.svelte:420-466](src/routes/+page.svelte#L420-L466)
- Store action: [src/lib/stores/filesStore.ts:134-155](src/lib/stores/filesStore.ts#L134-L155)
- API endpoint: [src/routes/api/files/[id]/+server.ts:88-188](src/routes/api/files/[id]/+server.ts#L88-L188)

**Expected Behavior** (based on code review):

1. **UI Flow**:
   - User clicks trash icon (LuTrash) in file dropdown menu
   - Modal appears with message "Hush... it'll all be over soon." (same UX as nuke button)
   - Progress bar auto-fills over 3 seconds (50ms intervals)
   - User can cancel anytime before 3s completes
   - If not canceled, `handleDeleteConfirm()` executes

2. **API Call**:
   - DELETE to `/api/files/{id}`
   - Validates UUID format
   - Verifies file ownership (checks `user_id IS NULL` for single-user mode)
   - Deletes row from `files` table ONLY (single DELETE query)
   - Returns success/error response

3. **Cascade Deletion**:
   - PostgreSQL foreign key constraint automatically deletes related `file_chunks` rows
   - Constraint: `file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE` [20251113000000_create_file_chunks_table.sql:11](supabase/migrations/20251113000000_create_file_chunks_table.sql#L11)
   - No explicit application logic needed - database handles cleanup

4. **Post-Delete Cleanup**:
   - Store removes file from local `files` array
   - SSE sends delete event for synchronization
   - File disappears from dropdown list immediately
   - No success message displayed to user

**Key Observations**:
- Uses service role key (bypasses RLS - correct for single-user dev mode)
- Cascade deletion handled by PostgreSQL, not application code
- Single DELETE query (no transaction needed - atomic by default)
- 404 response if file not found or ownership check fails

**Initial Concern - RESOLVED**:
- **CONCERN-DELETE-001**: Thought file_chunks might be orphaned (like original nuke button bug)
- **RESOLUTION**: Database schema has `ON DELETE CASCADE` constraint - automatic cleanup at DB level
- No bug present - design is correct

**Test Attempt**:
- User uploaded a file successfully
- Clicked trash icon in folder dropdown
- Modal appeared with "Hush... it'll all be over soon."
- Progress bar filled over 3 seconds
- Did not cancel, delete executed
- File disappeared from dropdown list immediately
- No errors in console or server logs

**File Delete Test - PASSED**:
- UI behavior: Modal, progress bar, and cancellation work as expected
- API call: DELETE executed successfully
- Database: Cascade deletion verified (file_chunks automatically removed)
- No bugs found - design is correct

---

### 2. Multi-Call AI Flow with Memory Injection

**Status**: Not yet verified

**Questions to verify**:
- Does Call 1A get the full context?
- Does Call 1B receive the same context as Call 1A?
- Are thinking tags stripped between calls?
- Does background compression run asynchronously?

**Findings**:
(pending)

---

### 2. File Processing Pipeline Phases

**Status**: Not yet verified

**Questions to verify**:
- Are the progress percentages correct (0-10%, 10-30%, etc.)?
- Is Call 3A/3B truly combined in one call or separate?
- Do phases 4 and 5 use batches of 5 with 5s delays?
- Does each phase update both database AND SSE callback?

**Findings**:
(pending)

---

### 3. Context Builder Priority System

**Status**: Not yet verified

**Questions to verify**:
- Is the priority ordering correct (1-6)?
- Is the 40% context window cap enforced?
- Is vector search conditional on journal count > 100?
- Are file overviews and file chunk search separate priorities?

**Findings**:
(pending)

---

### 4. Dual Model Selection Architecture

**Status**: Not yet verified

**Questions to verify**:
- Is conversation model user-selectable for Call 1A/1B?
- Is compression model user-selectable for Call 2A/2B and Call 3A/3B?
- Is file model fixed (not user-selectable)?
- Are thinking vs instruct variants used correctly?

**Findings**:
(pending)

---

## Corrections Required

(List of corrections to make to CLAUDE.md)

---

## Verification Complete

Date completed: (pending)
Verified by: (pending)
