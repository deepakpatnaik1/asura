# BUG-014: Nuke Button Doesn't Clear Files Table

## Status
- **Discovered**: 2025-11-12 (Afternoon)
- **Resolved**: 2025-11-12 (Afternoon)
- **Severity**: HIGH
- **Status**: ✅ RESOLVED - Fix implemented and tested

## Description
The "Nuke" button (delete all user data) only clears the `superjournal` and `journal` tables, but does NOT clear the `files` table. This leaves orphaned file records in the database.

## Reproduction Steps
1. Upload a file to the system (creates entry in `files` table)
2. Click the "Nuke" button in the UI
3. Query the database to check table contents

## Expected Behavior
All user data should be deleted, including:
- ✅ Superjournal table (conversation turns)
- ✅ Journal table (compressed turns)
- ❌ Files table (uploaded files)

## Actual Behavior
- Superjournal table: Cleared successfully (0 records)
- Journal table: Cleared successfully (0 records)
- Files table: NOT cleared (1 record remains)

## Evidence

### Database State After Nuke Operation
```
Superjournal: 0 records ✅
Journal: 0 records ✅
Files: 1 record ❌
```

### Remaining File in Database
```json
{
  "id": "105bb23d-7c0e-4168-a104-79596facacf5",
  "filename": "gettysburg.txt",
  "status": "failed",
  "error_message": "[COMPRESSION_ERROR] Compression failed: Failed to parse API response as JSON"
}
```

## Affected Code

### File: src/routes/api/nuke/+server.ts

The nuke endpoint implementation:
```typescript
export const POST: RequestHandler = async () => {
	// Step 1: Delete all Superjournal entries
	const { error: superjournalError } = await supabase
		.from('superjournal')
		.delete()
		.neq('id', '00000000-0000-0000-0000-000000000000');

	// Step 2: Delete Journal entries
	const { error: journalError } = await supabase
		.from('journal')
		.delete()
		.not('superjournal_id', 'is', null);

	// ❌ MISSING: No deletion of files table
}
```

**Issue**: The endpoint only deletes from `superjournal` and `journal` tables, but does not delete from `files` table.

## Root Cause Analysis

### Step 1: Stop and Listen ✅
- User clicked nuke button
- Expected all data to be deleted
- Files table still contains 1 record

### Step 2: Gather Context ✅
- Checked database state via Node.js query
- Confirmed superjournal and journal are empty
- Confirmed files table still has 1 record
- Reviewed nuke endpoint source code

### Step 3: Root Cause Identified
The nuke endpoint in `src/routes/api/nuke/+server.ts` only implements deletion for:
1. Superjournal table (lines 13-16)
2. Journal table (lines 27-30)

**Missing**: Deletion of files table

This appears to be an **incomplete implementation** rather than intentional design.

## Hypotheses

### Hypothesis 1: Intentional Omission (UNLIKELY)
Files table was intentionally excluded from nuke operation to preserve uploaded files across conversation resets.

**Evidence Against**:
- Nuke button is labeled as "delete all user data"
- User expectation is complete data wipe
- Test session documentation refers to "clean slate"

### Hypothesis 2: Incomplete Implementation (LIKELY)
Files table deletion was simply forgotten or not yet implemented.

**Evidence For**:
- No comment explaining why files are excluded
- Nuke endpoint is straightforward deletion of other tables
- Files table should be part of "user data"

### Hypothesis 3: Cascade Deletion Expected (UNLIKELY)
Developer expected files to be automatically deleted via database cascade rules.

**Evidence Against**:
- No foreign key constraints from superjournal/journal to files
- Files table is independent (no cascade relationship)

## Impact
- Unable to achieve clean slate for testing
- Orphaned file records accumulate in database
- Failed files remain visible in UI potentially
- Manual database cleanup required for testing

## Proposed Solution

Add files table deletion to nuke endpoint:

```typescript
// Step 3: Delete all Files entries
const { error: filesError } = await supabase
	.from('files')
	.delete()
	.neq('id', '00000000-0000-0000-0000-000000000000');

if (filesError) {
	console.error('[Nuke] Files delete error:', filesError);
	return json({ error: 'Failed to delete files' }, { status: 500 });
}

console.log('[Nuke] Successfully deleted all Files entries');
```

## Resolution

### Implementation Summary
Fixed via **subagent workflow** (Doer → Reviewer → Doer → Reviewer):
- **Plan created**: Initial plan scored 6/10 - needs revision
- **Plan revised**: Addressed 5 critical issues, scored 9/10 - APPROVED
- **Implementation**: All 3 changes implemented
- **Code review**: Scored 10/10 - APPROVED

### Changes Made
**File**: `src/routes/api/nuke/+server.ts`

1. **Fixed Journal Deletion Bug** (lines 25-30):
   - Changed from `.not('superjournal_id', 'is', null)`
   - To `.neq('id', '00000000-0000-0000-0000-000000000000')`
   - Now deletes ALL journal entries, not just non-null superjournal_id

2. **Added Files Table Deletion** (lines 39-50):
   - New Step 3 with files table deletion
   - Same pattern as other deletions
   - Proper error handling and logging

3. **Updated Success Message** (line 54):
   - From: "All Superjournal and orphaned Journal entries deleted"
   - To: "All Superjournal, Journal, and Files entries deleted"

### Testing Results
**Test 3** in `TEST-SESSION-2025-11-12-AFTERNOON.md`:
- ✅ Files table: 1 record → 0 records
- ✅ Superjournal table: 0 records (unchanged)
- ✅ Journal table: 0 records (unchanged)
- ✅ All tables completely cleared

### Next Steps
1. ✅ Get user approval for fix approach
2. ✅ Implement files table deletion in nuke endpoint
3. ✅ Test nuke operation with files present
4. ✅ Verify complete database cleanup
5. ✅ Update success message to include files table

## Related Files
- `src/routes/api/nuke/+server.ts` - Nuke endpoint implementation (MODIFIED)
- `working/BUG-014-plan-revised.md` - Approved implementation plan (9/10)
- `working/BUG-014-implementation.md` - Implementation summary
- `working/BUG-014-code-review.md` - Code review (10/10)
- `working/TEST-SESSION-2025-11-12-AFTERNOON.md` - Test session with Test 3 results
