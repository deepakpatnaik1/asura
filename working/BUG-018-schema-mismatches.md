# BUG-018: Database Schema Mismatches in File Endpoints

## Status
- **Discovered**: 2025-11-12 (Test 6 failure investigation)
- **Severity**: CRITICAL (Blocks all file operations)
- **Status**: 🔍 DOCUMENTED - Ready for fix plan

## Description
Multiple file endpoints reference database columns that don't exist (`created_at`) and use incorrect null handling for `user_id` queries. The database schema uses `uploaded_at` but code queries `created_at`.

## Browser Console Errors
```
[Error] Failed to load resource: the server responded with a status of 500 (Internal Server Error) (files)
[Error] [Files Store] Initial fetch failed: Error: Failed to retrieve file list
[Error] Failed to load resource: the server responded with a status of 500 (Internal Server Error) (upload)
[Error] [Chunk 9 UI] Upload failed: Error: Duplicate check failed: invalid input syntax for type uuid: "null"
```

## Server Log Errors
```
[List API] Database query error: {
  code: '42703',
  message: 'column files.created_at does not exist'
}
```

## Root Cause Analysis

### Issue 1: Wrong Column Name (created_at vs uploaded_at)

**Database Schema** (from migration `20251111120100_create_files_table.sql`):
```sql
-- Line 58-59
uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Actual columns**: `uploaded_at`, `updated_at`
**Code references**: `created_at` (doesn't exist)

### Issue 2: Incorrect NULL Handling for user_id

**PostgreSQL Behavior**:
- `.eq('user_id', null)` → Tries to compare `user_id = 'null'` (string) → Invalid UUID error
- `.is('user_id', null)` → Correctly compares `user_id IS NULL` → Works

**Reference Implementation** (`context-builder.ts` lines 85, 107, 130, 154):
```typescript
if (userId === null) {
  query = query.is('user_id', null);
} else {
  query = query.eq('user_id', userId);
}
```

## Affected Files

### 1. `/api/files/+server.ts` (List endpoint)

**Line 31**: Selects non-existent column
```typescript
.select('id, filename, file_type, status, progress, processing_stage, error_message, created_at, updated_at')
//                                                                                    ^^^^^^^^^^
//                                                                                    Should be: uploaded_at
```

**Line 32**: Incorrect null handling
```typescript
.eq('user_id', userId)
// ❌ With userId=null, PostgreSQL tries: user_id = 'null' (invalid UUID)
// ✅ Should be: if (userId === null) query.is('user_id', null) else query.eq('user_id', userId)
```

**Line 33**: Orders by non-existent column
```typescript
.order('created_at', { ascending: false });
//      ^^^^^^^^^^
//      Should be: uploaded_at
```

### 2. `src/lib/file-processor.ts` - `checkDuplicate()` function

**Line 685**: Incorrect null handling
```typescript
.eq('user_id', userId)
// ❌ With userId=null, PostgreSQL tries: user_id = 'null' (invalid UUID)
// ✅ Should use conditional: if (userId === null) query.is('user_id', null)
```

**Lines 682-687**: Full context
```typescript
const { data, error } = await supabase
  .from('files')
  .select('id')
  .eq('user_id', userId)  // ❌ BREAKS with null
  .eq('content_hash', contentHash)
  .limit(1);
```

### 3. Client-side filesStore.ts

**Line 31** (in `FileItem` interface, inferred from usage):
Uses `created_at` field that doesn't match database schema

## Impact

**Complete file system failure**:
1. ❌ File list endpoint returns 500 error (can't query created_at)
2. ❌ File upload fails duplicate check (invalid UUID syntax)
3. ❌ Files store can't initialize (initial fetch fails)
4. ❌ SSE connection established but no files to show
5. ❌ User sees empty dropdown, no progress updates

## Evidence Trail

### Test 6 Failure
User clicked paperclip, selected file:
- Browser: "Failed to load resource: 500 (files)"
- Browser: "Upload failed: Duplicate check failed: invalid input syntax for type uuid: 'null'"
- Server: "column files.created_at does not exist"

### Why This Wasn't Caught Earlier

1. **BUG-016/017 Implementation**: Code review scored 10/10 but reviewer didn't verify:
   - Column names against actual database schema
   - Null handling pattern consistency with context-builder.ts

2. **No Running Tests**: Implementation was deployed without executing tests

3. **Incomplete Review Scope**: Reviewer focused on new code (createFilePending, processFileBackground) but didn't check existing endpoints that handle null userId

## Required Fixes

### Fix 1: Update Column References (3 locations)

1. **`/api/files/+server.ts` line 31**:
   - Change `created_at` → `uploaded_at` in SELECT

2. **`/api/files/+server.ts` line 33**:
   - Change `created_at` → `uploaded_at` in ORDER BY

3. **`src/lib/stores/filesStore.ts`**:
   - Verify FileItem interface uses `uploaded_at` (not `created_at`)
   - If code uses `created_at`, update to `uploaded_at`

### Fix 2: Implement Proper NULL Handling (2 locations)

1. **`/api/files/+server.ts` line 32**:
```typescript
// Current (BROKEN):
let query = supabase
  .from('files')
  .select('...')
  .eq('user_id', userId)  // ❌ Breaks with null

// Fixed:
let query = supabase
  .from('files')
  .select('...');

if (userId === null) {
  query = query.is('user_id', null);
} else {
  query = query.eq('user_id', userId);
}

query = query.order('uploaded_at', { ascending: false });
```

2. **`src/lib/file-processor.ts` line 682-687**:
```typescript
// Current (BROKEN):
const { data, error } = await supabase
  .from('files')
  .select('id')
  .eq('user_id', userId)  // ❌ Breaks with null
  .eq('content_hash', contentHash)
  .limit(1);

// Fixed:
let query = supabase
  .from('files')
  .select('id');

if (userId === null) {
  query = query.is('user_id', null);
} else {
  query = query.eq('user_id', userId);
}

const { data, error } = await query
  .eq('content_hash', contentHash)
  .limit(1);
```

## Testing Requirements

After fix:
1. File list endpoint returns 200 (not 500)
2. File upload succeeds without UUID errors
3. Duplicate check works with userId=null
4. Files appear in dropdown immediately
5. Progress updates work (0% → 100%)

## Related Files
- `supabase/migrations/20251111120100_create_files_table.sql` - Database schema reference
- `src/lib/context-builder.ts` - Reference implementation for null userId handling
- `src/routes/api/files/+server.ts` - List endpoint (needs fix)
- `src/lib/file-processor.ts` - Duplicate check (needs fix)
- `src/lib/stores/filesStore.ts` - Client interface (needs verification)

## Related Bugs
- **BUG-014**: Nuke button (✅ RESOLVED)
- **BUG-015**: Auth blocking (✅ RESOLVED)
- **BUG-016**: Duplicate button (✅ RESOLVED)
- **BUG-017**: ID mismatch (✅ RESOLVED - but revealed BUG-018 during testing)

## Next Steps
1. Create fix plan using subagent workflow
2. Review plan (must score ≥8/10)
3. Implement fixes to all affected locations
4. Review implementation (must score ≥8/10)
5. Test file upload end-to-end
