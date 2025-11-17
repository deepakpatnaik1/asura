# BUG-017: File Upload Stuck at 0% - No Background Processing

## Status
- **Discovered**: 2025-11-12 (Test 5)
- **Severity**: CRITICAL (Core feature completely broken)
- **Status**: 🔍 INVESTIGATING

## Description
After selecting a file for upload, the file appears in the dropdown but remains stuck at "Pending 0%" indefinitely. No background processing occurs - the file never progresses through the expected stages (0% → 25% → 75% → 90% → 100%).

## Reproduction Steps
1. Open application at http://localhost:5173
2. Click paperclip button and select a file
3. File dropdown opens showing the file
4. File shows "Pending 0%" status
5. Wait... file never progresses

## Expected Behavior
File should progress through processing stages with real-time SSE updates:
- 0% - Upload complete, pending
- 25% - Extraction complete
- 75% - Compression complete
- 90% - Embedding complete
- 100% - Finalization complete, status: "Ready"
- Total time: ~10-15 seconds for small text file

## Actual Behavior
- File appears in dropdown immediately ✅
- File shows "Pending 0%" ✅
- File NEVER progresses beyond 0% ❌
- No SSE updates received ❌
- No background processing occurs ❌
- File remains stuck indefinitely ❌

## Evidence

### Code Analysis

**File**: `src/routes/api/files/upload/+server.ts`

**Lines 95-108** - Background processing (fire-and-forget):
```typescript
// 5. PROCESS FILE (async in background)
// Fire-and-forget: Don't await, return immediately to client
processFile(
  {
    fileBuffer,
    filename,
    userId,
    contentType
  },
  { skipDuplicateCheck: false } // Check for duplicates
).catch(error => {
  // Log but don't throw - processing failures are captured in DB
  console.error('[Upload API] Background processing error:', error);
});
```

**Lines 113-125** - Return with placeholder ID:
```typescript
return json(
  {
    success: true,
    data: {
      id: 'pending-id-placeholder', // ❌ HARDCODED PLACEHOLDER
      filename,
      fileSize: size,
      status: 'pending',
      message: 'File upload started. Processing in background.'
    }
  },
  { status: 202 } // 202 Accepted - processing started
);
```

**Problem 1**: Returns `'pending-id-placeholder'` instead of real file ID
**Problem 2**: Doesn't wait for `processFile()` to create database record
**Problem 3**: Client receives placeholder ID, can't match with SSE updates

### Files Store Behavior

**File**: `src/lib/stores/filesStore.ts`

**Lines 105-118** - Client-side creates pending file:
```typescript
// Add pending file to store immediately (will update via SSE)
const newFile: FileItem = {
  id: json.data.id || crypto.randomUUID(), // Uses placeholder or generates random ID
  filename: file.name,
  file_type: inferFileType(file.name),
  status: 'pending',
  progress: 0,
  processing_stage: null,
  error_message: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

files.update((current) => [newFile, ...current]);
```

**Problem**: Client creates file with ID = `'pending-id-placeholder'` or random UUID. When SSE sends updates with the REAL database ID, the client can't match them (different IDs).

### SSE Update Matching

**Lines 326-343** - SSE event handler:
```typescript
if (eventType === 'file-update' && file) {
  // Update or insert file
  files.update((current) => {
    const existing = current.findIndex((f) => f.id === file.id);

    if (existing >= 0) {
      // Update existing
      const updated = [...current];
      updated[existing] = {
        ...updated[existing],
        ...file
      };
      return updated;
    } else {
      // Insert new
      return [file, ...current];
    }
  });
}
```

**Problem**: `findIndex((f) => f.id === file.id)` looks for matching ID. Client has placeholder/random ID, SSE has database ID → no match → updates lost → file stuck at 0%.

## Root Cause Analysis

### The ID Mismatch Problem

1. **Upload API** returns `id: 'pending-id-placeholder'` immediately (line 117)
2. **Client** creates file with this placeholder ID (line 107 of filesStore.ts)
3. **processFile()** runs in background, creates DB record with REAL UUID
4. **SSE** broadcasts updates with REAL database ID
5. **Client** can't match SSE updates (placeholder !== real ID)
6. **Result**: File stuck at 0%, no progress updates

### Why Fire-and-Forget Doesn't Work

The upload endpoint uses "fire-and-forget" pattern (lines 97-108):
- Calls `processFile()` without awaiting
- Returns immediately with placeholder
- processFile() creates DB record asynchronously
- No way to get real ID back to client

**Design flaw**: Can't return real ID if you don't wait for DB insertion.

## Proposed Solutions

### Option 1: Wait for DB Insertion (Recommended)
Modify upload endpoint to:
1. Await `processFile()` until it creates the DB record and returns the real ID
2. Return the real file ID to client
3. Let remaining processing (extraction, compression, etc.) continue in background

**Benefits**:
- Client gets real ID immediately
- SSE updates match correctly
- Minimal behavior change

**Implementation**:
- Modify `processFile()` to return file ID after DB insert
- Await only the DB insert step in upload endpoint
- Background processing continues as before

### Option 2: Client-Side ID Generation
Let client generate the UUID and pass it to server:
1. Client generates UUID before upload
2. Client creates pending file with this UUID
3. Client sends UUID with upload request
4. Server uses client's UUID for DB record
5. SSE updates use same UUID

**Benefits**:
- Client knows ID immediately
- No waiting required
- SSE matching works

**Drawbacks**:
- UUID generation moves to client
- Server must trust client's UUID (validate uniqueness)

### Option 3: Filename-Based Matching
Match SSE updates by filename instead of ID:
1. Client creates file with placeholder ID
2. SSE sends updates with filename
3. Client matches by filename, updates ID when received

**Drawbacks**:
- Filename not unique (user could upload same file twice)
- Race conditions if multiple files have same name
- Complex edge cases

## Testing Requirements

After fixing:
1. Upload small text file → should progress 0% → 25% → 75% → 90% → 100%
2. Check browser console for SSE events with matching IDs
3. Check server logs for processFile() execution
4. Verify database record created with correct ID
5. Test multiple concurrent uploads (ID matching must work)
6. Test same filename uploaded twice (must handle correctly)

## Related Files
- `src/routes/api/files/upload/+server.ts` (lines 95-125) - Upload endpoint with placeholder ID
- `src/lib/file-processor.ts` - Background processing function
- `src/lib/stores/filesStore.ts` (lines 81-126, 323-351) - Client-side file management and SSE handling
- `src/routes/api/files/events/+server.ts` - SSE endpoint

## Related Bugs
- **BUG-016**: Duplicate file button (discovered same test)
- **BUG-015**: Auth blocking (fixed - enabled file uploads to work)

## Impact
**CRITICAL** - File upload feature completely non-functional:
- Files appear to upload but never process
- No feedback on processing status
- Files stuck permanently at 0%
- Users cannot use uploaded files for context injection
- Core feature broken

## Next Steps
1. **Investigate**: Check server logs during upload attempt
2. **Verify**: Confirm processFile() is actually running
3. **Verify**: Check if DB record is created with real ID
4. **Verify**: Check if SSE is broadcasting updates
5. **Decide**: Choose solution approach (recommend Option 1)
6. **Implement**: Modify upload endpoint to return real ID
7. **Test**: Verify progress updates work end-to-end
