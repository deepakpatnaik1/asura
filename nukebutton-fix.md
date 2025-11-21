# Nuke Button Fix

## Issue: Chat API Returning 500 Error [RESOLVED]

### Bug Report
**Reported**: 2025-11-21
**User Action**: Asked Gunnar a question
**Error Displayed**: ❌ Failed to generate response. Please try again.
**HTTP Status**: 500 Internal Server Error
**Status**: ✅ RESOLVED - Root cause was Node version mismatch

### Console Logs
```
[Error] Failed to load resource: the server responded with a status of 500 (Internal Server Error) (chat, line 0)
[Error] Error sending message: – Error: Failed to send message
```

### Observations
1. **Scroll Debug Logs Working**: Auto-scroll functionality executing normally
   - Turn indicators found: 1
   - New boss card element detected
   - Scroll calculations completing
2. **Client-Side OK**: Frontend submitting messages correctly to `/api/chat`
3. **Server-Side Error**: 500 error suggests exception in POST handler at [src/routes/api/chat/+server.ts:320-535](src/routes/api/chat/+server.ts#L320-L535)

### Investigation Findings

**Error Handler Location**: Line 531-533 catches all exceptions and returns generic 500 error
```typescript
} catch (error) {
    console.error('Chat API error:', error);
    return json({ error: 'Failed to generate response' }, { status: 500 });
}
```

**Possible Causes** (without seeing server logs):
1. **Authentication Issue**: `safeGetSession()` failing (line 323)
2. **Database Query Failure**: User settings lookup failing (line 338-342)
3. **Context Builder Error**: `buildContextForCalls1A1B()` throwing exception (line 357-362)
4. **API Key Issue**: Anthropic API call failing (line 397-408)
5. **Model Config Error**: Invalid model identifier or missing parameters

**Node Version Discrepancy Detected**:
- System running Node v18.20.8 (incompatible with `styleText` export from `node:util`)
- Dev server process running but may be unstable
- Should be using Node v22.x per CLAUDE.md requirements

### Resolution
**Root Cause**: Node v18.20.8 running instead of required Node v22.x
- `styleText` export from `node:util` not available in Node v18
- Dev server was unstable/failing due to version incompatibility

**Fix Applied**:
1. Killed dev server running on Node v18
2. Restarted dev server with Node v22.21.1 via nvm
3. Chat API now working correctly

**Verification** (from server logs):
```
[Context Builder] Successfully built context
[Chat API] Context stats: { totalTokens: 0, components: {...} }
[Token Tracking] Saved: 1585 input, 492 output, $0.012135 cost
[Compression] Successfully saved to Journal
[Embedding] Successfully generated and saved embedding
```

**Test Question**: "what is an asteroid?"
**Result**: ✅ Gunnar responded successfully with asteroid explanation

## Nuke Button Test - FAILED

### Test Report
**Tested**: 2025-11-21 (after chat API fix)
**Action**: User clicked nuke button
**Result**: ❌ FAILED - Messages did not disappear from UI
**HTTP Status**: 500 Internal Server Error on `/api/nuke`

### Browser Console Logs
```
[Error] Failed to load resource: the server responded with a status of 500 (Internal Server Error) (nuke, line 0)
[Error] Nuke error: – Error: Failed to nuke database
Error: Failed to nuke database
	(anonymous function) (+page.svelte:833)
```

### Observations
1. **UI Behavior**: Messages remained visible after nuke button click
2. **API Response**: 500 error from `/api/nuke` endpoint
3. **Client-Side Error**: "Failed to nuke database" error caught at line 833 in +page.svelte
4. **Browser Refresh**: ✅ Messages gone after refresh (data WAS deleted despite error)

### Root Cause Found (Server Logs)
```
[Nuke] Starting user data cleanup for user: 3b5e4391-8a06-4920-9744-9fd63d72c3b6
[Nuke] Files delete error: {
  code: 'PGRST205',
  details: null,
  hint: "Perhaps you meant the table 'public.models'",
  message: "Could not find the table 'public.files' in the schema cache"
}
```

**Problem**: Nuke endpoint at [src/routes/api/nuke/+server.ts:50-59](src/routes/api/nuke/+server.ts#L50-L59) tries to delete from `files` table
- File upload system was removed in Sonnet 4.5 rebuild (per CLAUDE.md)
- `files` and `file_chunks` tables no longer exist in database
- Nuke operation executes deletions in sequence (lines 30-48 complete successfully)
- Operation fails at line 51-54 when attempting files deletion
- Returns 500 error after journal/superjournal already deleted
- Client receives error and doesn't update UI state

**Impact**:
- ✅ Data deletion works (journal + superjournal successfully deleted)
- ❌ Client receives 500 error and doesn't clear UI
- ❌ User sees error message despite successful deletion
- ❌ Must manually refresh browser to see empty state

**Sequence of Events**:
1. Superjournal deleted successfully (lines 30-38)
2. Journal deleted successfully (lines 40-48)
3. Files deletion attempted and fails (lines 50-59)
4. 500 error returned to client
5. Client shows error, doesn't clear messages from UI
6. Browser refresh shows empty state (confirms deletion worked)

## Fix Applied

### Changes Made
**File**: [src/routes/api/nuke/+server.ts](src/routes/api/nuke/+server.ts)

**Removed** (lines 50-59):
```typescript
// Delete files (CASCADE will automatically delete file_chunks)
const { error: filesError } = await supabase
    .from('files')
    .delete()
    .eq('user_id', userId);

if (filesError) {
    console.error('[Nuke] Files delete error:', filesError);
    return json({ error: 'Failed to delete files' }, { status: 500 });
}
```

**Updated Comment** (line 28):
- Before: `// 2. Delete user data (CASCADE will handle file_chunks via files foreign key)`
- After: `// 2. Delete user data`

### Expected Result After Fix
1. ✅ Superjournal deletion completes successfully
2. ✅ Journal deletion completes successfully
3. ✅ User settings deletion completes successfully
4. ✅ Endpoint returns 200 success response
5. ✅ Client receives success and clears UI immediately
6. ✅ No browser refresh required

### Test Results - SUCCESS ✅
**Tested**: 2025-11-21 (after fix applied)
- [x] Click nuke button with conversation history
- [x] Verify messages disappear from UI immediately (no refresh)
- [x] Check server logs show successful completion
- [x] Confirm no error messages displayed to user

**Outcome**: ✅ PASSED - Nuke button working as expected
- Messages disappeared from UI immediately after button click
- No error messages shown to user
- No browser refresh required
- Server logs confirm successful deletion

**Expected Server Logs** (after fix):
```
[Nuke] Starting user data cleanup for user: 3b5e4391-8a06-4920-9744-9fd63d72c3b6
[Nuke] Successfully deleted all data for user: 3b5e4391-8a06-4920-9744-9fd63d72c3b6
```

**Client Response**: 200 OK with `{ success: true, message: 'All your data has been deleted' }`

## Nuke Button Requirements

### Expected Behavior
1. **Regular user**: Nuke button deletes only that user's data (journal, superjournal entries)
2. **Admin user**: Nuke button deletes only the admin's own data, NOT other users' data
3. **UI update**: Data disappears immediately without browser refresh
4. **Permanent deletion**: All data for that user is permanently removed from database

### Implementation Location
- UI: [src/routes/+page.svelte:833](src/routes/+page.svelte#L833) `handleNukeConfirm()` function
- API: [src/routes/api/nuke/+server.ts](src/routes/api/nuke/+server.ts) `POST` handler
- Database: Direct DELETE queries (no stored procedure)

---

**Branch**: nukebutton-fix
**Date**: 2025-11-21