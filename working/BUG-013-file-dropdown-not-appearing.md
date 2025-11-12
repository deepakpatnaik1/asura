# BUG-013: File Dropdown Menu Fails to Appear on Button Click

## Summary
When clicking the paper clip (file button), the dropdown menu with files list does NOT appear. This is a separate UI issue from the file upload progress bug (BUG-012).

## Status
**ACTIVE** - Bug confirmed via Test 5 (2025-11-12)

## Severity
**CRITICAL** - Completely blocks file functionality. User cannot:
- See list of uploaded files
- Check file status
- Delete files
- Access any file-related features

## Reproduction Steps
1. Open application at http://localhost:5173
2. Click the paper clip icon (file button) in the UI
3. Observe that dropdown menu does not appear

## Expected Behavior
- Clicking file button should immediately show dropdown menu
- Dropdown should display:
  - "Files (N)" header with count
  - "PROCESSING (N)" section with files being processed
  - "READY (N)" section with completed files
  - "FAILED (N)" section with failed files (if any)

## Actual Behavior
- Clicking file button does nothing
- No dropdown menu appears
- No visual feedback
- Sometimes dropdown appears on retry/subsequent clicks
- Behavior is inconsistent

## Relationship to Other Bugs
- **Separate from BUG-012**: File upload progress stuck at 0%
  - BUG-012: Files upload but progress doesn't update
  - BUG-013: Cannot even see the dropdown to access files
- **Related to Test 4 regression**: REPLICA IDENTITY FULL broke dropdown completely
  - Test 4: Dropdown never appeared after REPLICA IDENTITY FULL
  - Test 5: After revert, dropdown intermittently fails

## Observations

### What's Working
- ✅ Paper clip icon is visible and clickable
- ✅ File upload via file picker works (when dropdown eventually appears)
- ✅ Files process successfully on backend

### What's NOT Working
- ❌ Dropdown doesn't appear on first click
- ❌ Inconsistent behavior (sometimes appears on retry)
- ❌ No error messages in console (need to check browser DevTools)

## Backend Logs
No backend errors related to dropdown functionality. This appears to be purely a frontend/UI issue.

## Hypothesis

### Possible Causes
1. **React/Svelte State Issue**: filesStore not loading data before dropdown renders
2. **SSE Connection Timing**: Dropdown depends on SSE connection establishing
3. **Initial Data Fetch Failure**: `/api/files` GET request failing silently
4. **CSS/Visibility Issue**: Dropdown rendering but not visible (z-index, display, etc.)
5. **Event Handler Issue**: Click handler not attached or firing correctly

### Most Likely
The dropdown likely depends on `filesStore` having data loaded. From `filesStore.ts`:
- On first subscriber, store fetches initial files via `fetchFiles()`
- If fetch fails or is slow, dropdown might not render
- SSE connection establishes separately

## Investigation Completed (Test Session 2025-11-12)

### Root Cause Identified
Dropdown rendering condition requires both flags to be true:
```svelte
{#if showFileList && $files.length > 0}  <!-- Line 430 -->
```
When `$files` is empty or not yet loaded, `$files.length > 0` is false, blocking dropdown render.

### Attempted Fix (UNVERIFIED)
**Approach**: Remove `$files.length > 0` check from dropdown condition
**Code change** (`src/routes/+page.svelte` line 430):
```svelte
<!-- BEFORE -->
{#if showFileList && $files.length > 0}

<!-- AFTER -->
{#if showFileList}
```
**Rationale**: Dropdown should appear when button clicked, even if no files exist yet

**Status**: ⚠️ FIX UNVERIFIED
- Cannot test because BUG-012 fix broke Supabase Realtime (Test 6)
- Fix logic appears sound but needs verification after BUG-012 resolved
- Code change uncommitted, exists in working directory only

### Relationship to BUG-012
BUG-013 fix is **blocked by BUG-012**:
1. BUG-012 async fix broke Realtime with "bindings mismatch" error
2. With Realtime broken, `filesStore` cannot load data
3. Without data, cannot verify if dropdown appears correctly
4. Must fix BUG-012 first before testing BUG-013 fix

## Next Steps
1. ⏸️ **STOP** - Do not commit this fix yet
2. 🔄 **Reset** - Revert uncommitted code changes (including this fix)
3. 🔧 **Fix BUG-012 first** - Resolve Realtime/progress update issue
4. 🔄 **Re-apply BUG-013 fix** - After BUG-012 resolved
5. 🧪 **Test** - Verify dropdown appears on button click
6. ✅ **Verify** - Test with empty files list and populated list
7. 📄 **Document** - Update with test results

## Affected Files
- `src/routes/+page.svelte` line 430 - Dropdown rendering condition (MODIFIED, UNCOMMITTED)
- `src/lib/stores/filesStore.ts` - Files store managing dropdown data
- `src/routes/api/files/+server.ts` - GET endpoint for files list

## User Impact
**CRITICAL**: Users cannot access any file upload features. This is a complete blocker for the file upload functionality.

## Priority
**P1** - Must fix AFTER BUG-012. Blocked by Realtime issue.

## Dependencies
- **Blocks**: None
- **Blocked by**: BUG-012 (File upload progress updates)

---

**Test Reference**: See `working/TEST-SESSION-2025-11-12.md` - Tests 5, 6
