# BUG-015: Authentication Checks Blocking All File Operations

## Status
- **Discovered**: 2025-11-12 (Afternoon Test Session)
- **Resolved**: 2025-11-12 (Afternoon)
- **Severity**: CRITICAL
- **Status**: ✅ RESOLVED - Fix implemented and code reviewed (10/10)

## Description
All 4 file-related API endpoints have authentication checks that return 401 Unauthorized when `userId = null`. This completely blocks file upload functionality even though the application is designed to work as a single-user system with no authentication.

## Reproduction Steps
1. Open application at http://localhost:5173
2. Click paperclip button to upload a file
3. Select a file from native macOS picker
4. Observe that dropdown does NOT appear
5. Check browser console - see 401 errors

## Expected Behavior
File endpoints should work with `userId = null` (single-user mode), following the same pattern as the chat endpoint which works correctly.

## Actual Behavior
All file operations fail with 401 Unauthorized:
```
[Error] Failed to load resource: the server responded with a status of 401 (Unauthorized) (files)
[Error] [Files Store] Initial fetch failed: Error: Authentication required
[Error] Failed to load resource: the server responded with a status of 401 (Unauthorized) (upload)
[Error] [Chunk 9 UI] Upload failed: Error: Authentication required
[Error] [Files Store] Max reconnection attempts reached (after 5 attempts)
```

## Evidence

### Affected Endpoints (4 total)
1. **Upload**: `/api/files/upload/+server.ts` (line 13)
2. **List**: `/api/files/+server.ts` (line 9)
3. **SSE Events**: `/api/files/events/+server.ts` (line 40)
4. **Details/Delete**: `/api/files/[id]/+server.ts` (lines 16 and 105)

All follow identical blocking pattern:
```typescript
const userId = null;  // TODO: Replace with actual auth

if (!userId) {
  return json({ error: { message: 'Authentication required', code: 'AUTH_REQUIRED' }}, { status: 401 });
}
```

### Working Reference: Chat Endpoint
The chat endpoint (`/api/chat/+server.ts`) demonstrates correct single-user pattern:
- Line 373: Passes `null` to `buildContextForCalls1A1B()`
- Line 433: Inserts with `user_id: null`
- **No auth check, no 401**
- Works perfectly

## Root Cause Analysis

### Why This Is A Bug (Not Incomplete Feature)
1. **Chat endpoint works** with `userId = null` - proves single-user mode is viable
2. **Library code supports null userId** - `context-builder.ts` and `file-processor.ts` have conditional logic for null
3. **TODO comments reference "Chunk 11"** - authentication was planned but not yet needed
4. **User prefers single-user approach** - avoids complexity, maintains Playwright MCP compatibility

### Hypothesis: Premature Authentication Guards
The auth checks were added in anticipation of "Chunk 11" (Google Auth implementation), but they block functionality that should work in single-user mode.

**Evidence**:
- All 4 endpoints have identical TODO comment: "TODO: Replace with actual auth"
- Library functions accept `userId: string | null` signature
- Database queries use conditional logic: `if (userId === null)` pattern
- No other endpoints require authentication

## Impact
**CRITICAL** - Completely blocks file upload feature:
- ❌ Cannot upload files
- ❌ Cannot list existing files
- ❌ Cannot receive progress updates (SSE)
- ❌ Cannot view file details or delete files
- ❌ Dropdown never appears (no files to show)
- ❌ Zero functionality for file management

**Working functionality**:
- ✅ Chat/LLM responses work (no auth check)
- ✅ Nuke button works (no auth check)

## Proposed Solution

**Remove authentication checks from 4 file endpoints** - follow chat endpoint pattern:

### Changes Required:
1. **Upload endpoint** (`/api/files/upload/+server.ts`): Remove lines 13-25 (auth check block)
2. **List endpoint** (`/api/files/+server.ts`): Remove lines 9-20 (auth check block)
3. **SSE endpoint** (`/api/files/events/+server.ts`): Remove lines 40-48 (auth check block)
4. **Details/Delete endpoint** (`/api/files/[id]/+server.ts`): Remove lines 16-28 (GET auth check) and lines 105-117 (DELETE auth check)

### What to Keep:
- Keep `const userId = null;` declaration
- Keep all downstream code that passes `userId` to functions
- Library code already handles null gracefully

### Pattern:
```typescript
// BEFORE (blocking):
const userId = null;
if (!userId) { return json({...}, { status: 401 }); }
// ... rest of code

// AFTER (working):
const userId = null;
// ... rest of code (works with null)
```

## Related Files
- `src/routes/api/files/upload/+server.ts` - Upload endpoint (needs fix)
- `src/routes/api/files/+server.ts` - List endpoint (needs fix)
- `src/routes/api/files/events/+server.ts` - SSE endpoint (needs fix)
- `src/routes/api/files/[id]/+server.ts` - Details/Delete endpoint (needs fix)
- `src/routes/api/chat/+server.ts` - Reference implementation (works correctly)
- `src/lib/context-builder.ts` - Handles null userId gracefully
- `src/lib/file-processor.ts` - Handles null userId gracefully
- `working/TEST-SESSION-2025-11-12-AFTERNOON.md` - Test documentation (Test 4 failed, comprehensive investigation completed)

## Resolution

### Implementation Summary
Fixed via **subagent workflow** (Doer → Reviewer → Doer → Reviewer):
- **Plan created**: Doer agent created detailed implementation plan
- **Plan reviewed**: Reviewer agent scored 10/10 - APPROVED
- **Implementation**: All 4 files modified (6 total changes - File 4 has both GET and DELETE handlers)
- **Code review**: Reviewer agent scored 10/10 - APPROVED

### Changes Made
All 4 file endpoints modified to remove authentication check blocks:

1. **File**: `src/routes/api/files/upload/+server.ts`
   - Removed lines 15-25 (auth check block)
   - Preserved line 13: `const userId = null;` declaration

2. **File**: `src/routes/api/files/+server.ts`
   - Removed lines 11-21 (auth check block)
   - Preserved line 9: `const userId = null;` declaration

3. **File**: `src/routes/api/files/events/+server.ts`
   - Removed lines 42-54 (auth check block)
   - Preserved line 40: `const userId = null;` declaration

4. **File**: `src/routes/api/files/[id]/+server.ts`
   - GET handler: Removed lines 18-28 (auth check), preserved line 16: `const userId = null;`
   - DELETE handler: Removed lines 107-117 (auth check), preserved line 93: `const userId = null;`

### Pattern Applied
All endpoints now follow the working pattern from chat endpoint:
- Keep `const userId = null;` declaration
- Remove `if (!userId) return 401` block
- Pass null userId to downstream functions
- Library code handles null gracefully with conditional queries

### Testing Status
- ✅ Implementation complete
- ✅ Code review passed (10/10)
- ⏳ User testing pending (retry Test 4 from test session)

### Next Steps
1. ✅ Create implementation plan via Doer agent
2. ✅ Review plan via Reviewer agent (scored 10/10)
3. ✅ Implement auth check removal (all 4 files modified)
4. ✅ Review implementation via Reviewer agent (scored 10/10)
5. ⏳ AWAITING: User to test file upload (retry Test 4 from test session)
6. ⏳ PENDING: Verify all file operations work correctly

### Related Files
- `working/BUG-015-plan.md` - Approved implementation plan (10/10)
- `working/BUG-015-plan-review.md` - Plan review (10/10)
- `working/BUG-015-implementation.md` - Implementation summary
- `working/BUG-015-code-review.md` - Code review (10/10)
- `working/TEST-SESSION-2025-11-12-AFTERNOON.md` - Test session (Test 4 failed, awaiting retest)
