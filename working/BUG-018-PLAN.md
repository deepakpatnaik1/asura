# BUG-018 Fix Plan: Database Schema Mismatches

## Overview

This plan addresses two critical issues preventing file upload functionality:

1. **Column Name Mismatch**: Code references `created_at` column that doesn't exist in database (should be `uploaded_at`)
2. **NULL Handling Bug**: Code uses `.eq('user_id', userId)` with null, which breaks PostgreSQL (should use `.is('user_id', null)`)

Both issues cause 500 errors that completely block file list retrieval and file uploads.

## Root Cause

### Issue 1: Wrong Column Name
Database schema (migration `20251111120100_create_files_table.sql`) defines:
- `uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

But code queries/references:
- `created_at` (doesn't exist)

### Issue 2: Invalid NULL Handling
PostgreSQL behavior:
- `.eq('user_id', null)` → Attempts `user_id = 'null'` (string) → UUID parse error
- `.is('user_id', null)` → Correctly uses `user_id IS NULL` → Works

Reference implementation in `context-builder.ts` (lines 85-88, 107-110, 130-133, 154-157) shows correct pattern.

## Affected Files Summary

1. `/Users/d.patnaik/code/asura/src/routes/api/files/+server.ts` - 3 changes
2. `/Users/d.patnaik/code/asura/src/lib/file-processor.ts` - 1 change
3. `/Users/d.patnaik/code/asura/src/lib/stores/filesStore.ts` - 1 change

Total: 5 changes across 3 files

---

## Fix 1: Column Name (created_at → uploaded_at)

### File 1: `/Users/d.patnaik/code/asura/src/routes/api/files/+server.ts`

**Change 1.1: Line 31 - SELECT clause**

**Before:**
```typescript
.select('id, filename, file_type, status, progress, processing_stage, error_message, created_at, updated_at')
```

**After:**
```typescript
.select('id, filename, file_type, status, progress, processing_stage, error_message, uploaded_at, updated_at')
```

**Reason:** Database has `uploaded_at` column, not `created_at`

---

**Change 1.2: Line 33 - ORDER BY clause**

**Before:**
```typescript
.order('created_at', { ascending: false });
```

**After:**
```typescript
.order('uploaded_at', { ascending: false });
```

**Reason:** Database has `uploaded_at` column, not `created_at`

---

### File 2: `/Users/d.patnaik/code/asura/src/lib/stores/filesStore.ts`

**Change 1.3: Line 19 - FileItem interface**

**Before:**
```typescript
export interface FileItem {
	id: string;
	filename: string;
	file_type: FileType;
	status: FileStatus;
	progress: number;
	processing_stage: ProcessingStage | null;
	error_message: string | null;
	created_at: string;
	updated_at: string;
}
```

**After:**
```typescript
export interface FileItem {
	id: string;
	filename: string;
	file_type: FileType;
	status: FileStatus;
	progress: number;
	processing_stage: ProcessingStage | null;
	error_message: string | null;
	uploaded_at: string;
	updated_at: string;
}
```

**Reason:** Interface must match database schema column names

**Additional Changes Required:**
After changing the interface, update all references:

**Change 1.4: Line 114 - uploadFile() function**

**Before:**
```typescript
created_at: new Date().toISOString(),
```

**After:**
```typescript
uploaded_at: new Date().toISOString(),
```

**Reason:** Match updated interface field name

---

## Fix 2: NULL Handling (user_id queries)

### File 3: `/Users/d.patnaik/code/asura/src/routes/api/files/+server.ts`

**Change 2.1: Lines 29-33 - Query construction with conditional NULL handling**

**Before:**
```typescript
// 3. QUERY DATABASE
let query = supabase
  .from('files')
  .select('id, filename, file_type, status, progress, processing_stage, error_message, created_at, updated_at')
  .eq('user_id', userId)
  .order('created_at', { ascending: false });
```

**After:**
```typescript
// 3. QUERY DATABASE
let query = supabase
  .from('files')
  .select('id, filename, file_type, status, progress, processing_stage, error_message, uploaded_at, updated_at');

// Handle user_id filtering (null requires IS NULL, not eq)
if (userId === null) {
  query = query.is('user_id', null);
} else {
  query = query.eq('user_id', userId);
}

query = query.order('uploaded_at', { ascending: false });
```

**Reason:**
- Implements correct NULL handling pattern from `context-builder.ts`
- Also fixes column name from `created_at` to `uploaded_at` (combines Fix 1.1 and 1.2)

**Note:** This change combines all three fixes for `/api/files/+server.ts` into one cohesive rewrite

---

### File 4: `/Users/d.patnaik/code/asura/src/lib/file-processor.ts`

**Change 2.2: Lines 682-687 - checkDuplicate() function**

**Before:**
```typescript
const { data, error } = await supabase
  .from('files')
  .select('id')
  .eq('user_id', userId)
  .eq('content_hash', contentHash)
  .limit(1);
```

**After:**
```typescript
let query = supabase
  .from('files')
  .select('id');

// Handle user_id filtering (null requires IS NULL, not eq)
if (userId === null) {
  query = query.is('user_id', null);
} else {
  query = query.eq('user_id', userId);
}

const { data, error } = await query
  .eq('content_hash', contentHash)
  .limit(1);
```

**Reason:**
- Prevents "invalid input syntax for type uuid: 'null'" error
- Implements correct NULL handling pattern from `context-builder.ts`

---

## Verification Steps

After implementing fixes, verify:

### 1. Code Inspection
- [ ] All references to `created_at` changed to `uploaded_at`
- [ ] All `.eq('user_id', userId)` changed to conditional `.is()` / `.eq()` pattern
- [ ] FileItem interface matches database schema
- [ ] No TypeScript compilation errors

### 2. Database Schema Verification
```sql
-- Run in Supabase SQL Editor
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'files'
  AND column_name IN ('created_at', 'uploaded_at');
```

Expected result: Only `uploaded_at` exists (no `created_at`)

### 3. Build Verification
```bash
npm run build
```

Expected: No TypeScript errors about missing `uploaded_at` property

---

## Testing Plan

### Test 1: File List Endpoint (Fix 1 + Fix 2)

**Setup:**
- Browser with DevTools open
- Clear console

**Steps:**
1. Navigate to `/`
2. Open Network tab
3. Observe initial `/api/files` request

**Expected:**
- Status: 200 OK (not 500)
- Response body: `{ success: true, data: { files: [], count: 0 } }`
- No "column files.created_at does not exist" error in server logs
- No "invalid input syntax for type uuid" error

**Actual Before Fix:**
- Status: 500
- Error: "column files.created_at does not exist"

---

### Test 2: File Upload with Duplicate Check (Fix 2)

**Setup:**
- Browser at `/`
- Test file: `test.txt` with content "Hello World"

**Steps:**
1. Click paperclip icon
2. Select `test.txt`
3. Observe network requests in DevTools

**Expected:**
- `/api/files/upload` request succeeds (200 OK)
- File appears in dropdown with "pending" status
- SSE updates show progress: 0% → 25% → 75% → 90% → 100%
- Final status: "ready"
- No "invalid input syntax for type uuid: 'null'" error
- No "Duplicate check failed" error (first upload)

**Actual Before Fix:**
- Status: 500
- Error: "Duplicate check failed: invalid input syntax for type uuid: 'null'"

---

### Test 3: File Appears in Dropdown (Fix 1)

**Setup:**
- After successful upload from Test 2

**Steps:**
1. Click paperclip icon
2. Observe dropdown content

**Expected:**
- File `test.txt` appears in list
- Shows correct timestamp (from `uploaded_at`)
- Shows "ready" status
- Shows 100% progress

**Actual Before Fix:**
- Empty dropdown (500 error prevented file list retrieval)

---

### Test 4: Duplicate Upload Prevention (Fix 2)

**Setup:**
- After successful upload from Test 2
- Same test file `test.txt`

**Steps:**
1. Click paperclip icon
2. Select `test.txt` again
3. Observe error message

**Expected:**
- Upload blocked with user-friendly error
- Error message: "File already exists (duplicate content hash: ...)"
- No 500 error
- Duplicate check query succeeds using correct NULL handling

**Actual Before Fix:**
- Would fail with "invalid input syntax for type uuid: 'null'"

---

### Test 5: SSE Real-time Updates (Regression Check)

**Setup:**
- Browser at `/`
- DevTools Network tab open, filter "EventStream"

**Steps:**
1. Upload a new file (e.g., `test2.txt`)
2. Observe SSE events in Network tab
3. Observe file progress in dropdown

**Expected:**
- SSE connection established to `/api/files/events`
- Real-time updates received for uploaded file
- Progress bar animates: 0% → 25% → 75% → 90% → 100%
- Status updates: pending → processing → ready
- File remains in dropdown after completion

**Actual Before Fix:**
- SSE connected but no files visible (list endpoint 500 error)

---

### Test 6: Multiple Files (Edge Case)

**Setup:**
- Browser at `/`

**Steps:**
1. Upload 3 different files sequentially
2. Verify all appear in dropdown
3. Check they're ordered by newest first

**Expected:**
- All 3 files visible
- Ordered by `uploaded_at` descending (newest first)
- Each shows correct status and progress
- No duplicate entries

---

## Success Criteria

All tests must pass:

- [ ] **Test 1**: File list endpoint returns 200 (not 500)
- [ ] **Test 2**: File upload succeeds without UUID errors
- [ ] **Test 3**: Files appear in dropdown with correct timestamps
- [ ] **Test 4**: Duplicate detection works correctly
- [ ] **Test 5**: SSE updates work in real-time
- [ ] **Test 6**: Multiple files handled correctly

Additional criteria:

- [ ] No TypeScript compilation errors
- [ ] No server errors in console
- [ ] No browser console errors
- [ ] Code follows `context-builder.ts` NULL handling pattern consistently
- [ ] All column references match database schema

---

## Implementation Notes

### Order of Changes

Recommended sequence to minimize errors:

1. **First**: Fix `filesStore.ts` interface (Change 1.3, 1.4)
   - Reason: TypeScript will catch any missed references

2. **Second**: Fix `/api/files/+server.ts` (Change 2.1 - combines 1.1, 1.2, 2.1)
   - Reason: Single cohesive change to query logic

3. **Third**: Fix `file-processor.ts` checkDuplicate() (Change 2.2)
   - Reason: Independent from other changes

### Testing After Each Change

After each file change:
1. Run `npm run build` to verify TypeScript compilation
2. Check for any new TypeScript errors
3. Fix errors before proceeding to next change

### Common Pitfalls to Avoid

1. **Don't forget uploadFile() function** in filesStore.ts - it creates FileItem objects
2. **Don't mix patterns** - always use conditional `if/else` for NULL handling (never `.eq(field, null)`)
3. **Don't hardcode column names** - but in this case we're fixing TO match the schema
4. **Test both paths** - with `userId = null` AND with actual UUID

---

## Rollback Plan

If fixes cause new issues:

1. **Revert all changes**: `git checkout src/routes/api/files/+server.ts src/lib/file-processor.ts src/lib/stores/filesStore.ts`
2. **Alternative approach**: Temporarily disable duplicate checking (add `skipDuplicateCheck: true` option)
3. **Database fix** (NOT RECOMMENDED): Could add `created_at` column as alias, but this is wrong - code should match schema

---

## Related Context

- **Database Schema**: `/Users/d.patnaik/code/asura/supabase/migrations/20251111120100_create_files_table.sql` (lines 58-59)
- **Reference Implementation**: `/Users/d.patnaik/code/asura/src/lib/context-builder.ts` (NULL handling pattern)
- **Bug Documentation**: `/Users/d.patnaik/code/asura/working/BUG-018-schema-mismatches.md`
- **Test Failure**: Test 6 from file upload feature tests (documented in bug report)

---

## Post-Implementation Tasks

After all fixes pass testing:

1. Update test documentation to include regression tests for:
   - NULL user_id handling in file queries
   - Column name consistency with schema

2. Add code review checklist item:
   - "Verify all database queries use conditional NULL handling pattern from context-builder.ts"
   - "Verify all column references match database schema"

3. Consider adding TypeScript strict null checks to prevent similar issues

---

## Estimated Time

- Implementation: 15 minutes (5 changes across 3 files)
- Testing: 20 minutes (6 test cases)
- Total: 35 minutes

## Risk Assessment

**Low Risk** - Changes are:
- Straightforward column name fixes
- Well-established NULL handling pattern (already used in context-builder.ts)
- Isolated to file-related endpoints (no impact on other features)
- Easy to verify with existing test scenarios

**Confidence Level**: 95% - Fix directly addresses root cause identified in bug investigation
