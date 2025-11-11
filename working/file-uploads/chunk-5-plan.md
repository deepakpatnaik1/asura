# Chunk 5 Plan: File Processor Orchestration Layer

## Status
**Draft** - Ready for Reviewer feedback

**Prepared**: 2025-11-11
**Planner**: Claude (Doer)
**Dependencies**: Chunks 1, 2, 3, 4 (all completed)

---

## Overview

The File Processor is the orchestration layer that ties together all file processing libraries into a single end-to-end pipeline. It coordinates extraction, compression, embedding generation, and database storage while maintaining an all-or-nothing transaction pattern to ensure data consistency.

**Key Responsibilities:**
- Orchestrate the complete processing pipeline (extract → compress → embed → store)
- Track progress through each stage (0-100% with stage indicators)
- Handle errors gracefully with clear failure reporting
- Ensure all-or-nothing transaction safety (no partial data on failure)
- Provide hooks for real-time progress updates via SSE (Chunk 7)
- Verify file deduplication via content hash
- Maintain database consistency

---

## Dependencies

### Input Dependencies
- **Chunk 2** (File Extraction):
  - `extractText()` - Extract text from file buffer
  - `validateFileSize()` - Validate 10MB limit
  - `generateContentHash()` - Generate SHA-256 hash
  - `FileExtractionError` - Error handling
  - `ExtractionResult` - Result type
  - `FileType` enum - File classification

- **Chunk 4** (File Compressor):
  - `compressFile()` - Apply Artisan Cut compression
  - `FileCompressionError` - Error handling
  - `CompressionResult` - Result type

- **Chunk 3** (Vectorization):
  - `generateEmbedding()` - Generate 1024-dim embedding
  - `VectorizationError` - Error handling

- **Chunk 1** (Database):
  - `files` table with all 13 columns
  - Enums: file_status_enum, processing_stage_enum, file_type_enum
  - Foreign key to auth.users(id)
  - HNSW vector index on embedding column

### Runtime Dependencies
- **Supabase client**: `src/lib/supabase.ts` (already initialized)
- **Environment**: All .env variables for Chunks 2, 3, 4
- **Progress callbacks**: Optional callback for real-time updates (Chunk 7 integration)

---

## Design Decisions

### 1. Database Client Pattern

**Decision**: Use existing Supabase client singleton from `src/lib/supabase.ts`

**Rationale**:
- Client is already initialized and exported: `export const supabase = createClient(...)`
- Using singleton avoids creating multiple clients per request
- Follows existing codebase pattern

**Implementation**:
```typescript
import { supabase } from '$lib/supabase';

// Usage in processFile:
const { data, error } = await supabase
  .from('files')
  .insert([fileRecord])
  .select();
```

**Type Safety**:
- Create TypeScript interface matching the files table exactly
- Use strong typing for database operations
- Handle Supabase response types properly

### 2. Error Handling Strategy

**Decision**: Create custom `FileProcessorError` class that wraps errors from lower-level libraries

**Error Codes**:
- `VALIDATION_ERROR` - File size/type validation failed
- `EXTRACTION_ERROR` - Text extraction failed (from Chunk 2)
- `COMPRESSION_ERROR` - Content compression failed (from Chunk 4)
- `EMBEDDING_ERROR` - Embedding generation failed (from Chunk 3)
- `DUPLICATE_FILE` - File already exists (duplicate content hash)
- `DATABASE_ERROR` - Database insertion/update failed
- `UNKNOWN_ERROR` - Unexpected error

**Pattern**:
```typescript
export class FileProcessorError extends Error {
  constructor(
    message: string,
    public readonly code: FileProcessorErrorCode,
    public readonly stage: ProcessingStage,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'FileProcessorError';
  }
}
```

**Error Propagation**:
- Catch specific errors from lower-level libraries
- Wrap with context about which stage failed
- Update database record with error_message and status=failed on any error
- Never throw without updating database (ensure DB reflects failure)

**All-or-Nothing Pattern**:
- If extraction fails → no database record created
- If compression fails → database record updated with error_message and status=failed
- If embedding fails → database record updated with error_message and status=failed
- If database insertion fails → no partial data (Supabase transaction handles it)
- If database update fails → database record left in inconsistent state is acceptable (already saved progress)

### 3. Progress Reporting

**Decision**: Use callback function pattern for progress events

**Rationale**:
- Decouples file processor from SSE implementation
- Allows both synchronous (testing) and async (SSE) usage
- Chunk 5 focuses on core processing; Chunk 7 adds SSE subscription

**Interface**:
```typescript
export interface ProgressCallback {
  (update: ProgressUpdate): void | Promise<void>;
}

export interface ProgressUpdate {
  fileId: string;
  stage: ProcessingStage;
  progress: number; // 0-100
  message?: string;
}

// Usage in processFile():
if (onProgress) {
  await onProgress?.({
    fileId: file.id,
    stage: 'extraction',
    progress: 15,
    message: 'Extracted text (1250 words)'
  });
}
```

**Progress Timeline**:
- 0-5%: Validation and extraction start
- 5-25%: Text extraction from file (varies by file size)
- 25-75%: Compression via Modified Call 2A/2B (5-9 seconds typical)
- 75-90%: Embedding generation via Voyage AI (1-2 seconds typical)
- 90-95%: Database finalization
- 95-100%: Complete, status=ready

**Note**: Chunk 7 (SSE) will consume these callbacks and push updates to frontend

### 4. Transaction Safety

**Decision**: Use soft transaction pattern with database status field

**Why Not Hard Database Transactions?**:
- Processing takes 10-30 seconds (not suitable for ACID transactions)
- External API calls (Fireworks, Voyage AI) cannot be rolled back
- Long-running transactions lock resources

**Implementation Strategy**:
1. **Pre-create record** with status=pending
   - Allocates unique ID immediately
   - User sees file in list while processing
   - Allows real-time progress updates

2. **Update record** as stages complete
   - Set processing_stage, progress, updated_at
   - On error: set status=failed, error_message, updated_at
   - On completion: set status=ready, embedding, updated_at

3. **Idempotency** via content_hash
   - Check content_hash before processing
   - Reject duplicate files with DUPLICATE_FILE error
   - Prevents re-processing identical files

**Database Isolation**:
- No partial data because we never delete incomplete records
- Progress visible in real-time via updated_at changes
- Failure state (error_message) captures what went wrong
- Easy to retry or clean up failed files manually

### 5. File Type Classification

**Decision**: Use file type from extraction result (Chunk 2)

**Rationale**:
- Chunk 2 already classifies files by extension
- No additional classification needed
- Consistent with Artisan Cut prompt guidelines in Chunk 4

**Process**:
```typescript
const extraction = await extractText(buffer, filename);
// extraction.fileType is already classified
// Pass it to compressFile() as-is
```

---

## Implementation

### File: src/lib/file-processor.ts

**Size Estimate**: 500-700 lines

**Exports**:
- `FileProcessorError` class
- `ProcessingStage` type
- `FileProcessorErrorCode` type
- `ProgressUpdate` interface
- `ProgressCallback` type
- `ProcessFileInput` interface
- `ProcessFileOutput` interface
- `processFile()` async function

**Key Functions**:

#### 1. Main Function: `processFile()`

```typescript
export async function processFile(
  input: ProcessFileInput,
  options?: {
    onProgress?: ProgressCallback;
    skipDuplicateCheck?: boolean; // Default: false
  }
): Promise<ProcessFileOutput>
```

**Parameters**:
- `input.fileBuffer` - File contents as Buffer
- `input.filename` - Original filename with extension
- `input.userId` - User ID for database record
- `input.contentType` - MIME type (used for validation)
- `options.onProgress` - Optional progress callback
- `options.skipDuplicateCheck` - Allow re-processing (for testing)

**Flow**:
1. Validate input (size, type, user_id)
2. Extract text (Chunk 2)
3. Check for duplicates (optional)
4. Create database record with status=pending, progress=5%
5. Compress content (Chunk 4)
6. Update database with compression results, progress=75%
7. Generate embedding (Chunk 3)
8. Update database with embedding, status=ready, progress=100%
9. Return final ProcessFileOutput

**Error Handling**:
- On validation error → throw FileProcessorError, no DB record
- On extraction error → create DB record, set status=failed, error_message
- On compression error → update DB record, status=failed, error_message
- On embedding error → update DB record, status=failed, error_message
- On database error → throw FileProcessorError with DB details

**Return Type**:
```typescript
export interface ProcessFileOutput {
  id: string; // File ID from database
  filename: string;
  fileType: FileType;
  status: 'ready' | 'failed'; // Should be 'ready' if no error
  error?: {
    code: FileProcessorErrorCode;
    message: string;
    stage: ProcessingStage;
  };
}
```

#### 2. Helper Function: `createFileRecord()`

```typescript
async function createFileRecord(
  userId: string,
  filename: string,
  contentHash: string,
  fileType: FileType
): Promise<{ id: string }> {
  // Insert new file with status=pending
  // Return ID for updates
}
```

**Handles**:
- Generate unique ID
- Set initial status=pending
- Set progress=0
- Record uploaded_at timestamp

#### 3. Helper Function: `updateFileProgress()`

```typescript
async function updateFileProgress(
  fileId: string,
  update: {
    progress: number;
    stage?: ProcessingStage;
    message?: string;
  }
): Promise<void> {
  // Update progress, stage, and updated_at
}
```

**Handles**:
- Atomic updates to prevent race conditions
- Updates updated_at for real-time tracking
- Only updates provided fields

#### 4. Helper Function: `markFileComplete()`

```typescript
async function markFileComplete(
  fileId: string,
  description: string,
  embedding: number[]
): Promise<void> {
  // Update file with final results
  // Set status=ready, progress=100
}
```

#### 5. Helper Function: `markFileFailed()`

```typescript
async function markFileFailed(
  fileId: string,
  errorCode: FileProcessorErrorCode,
  errorMessage: string,
  stage: ProcessingStage
): Promise<void> {
  // Update file with error state
  // Set status=failed, error_message
}
```

#### 6. Helper Function: `checkDuplicate()`

```typescript
async function checkDuplicate(
  contentHash: string
): Promise<{ isDuplicate: boolean; existingFileId?: string }> {
  // Query by content_hash
  // Return existing file if found
}
```

**Rationale**: Use content hash from Chunk 2 for efficient duplicate detection

#### 7. Input Validation Helper

```typescript
function validateProcessFileInput(input: ProcessFileInput): void {
  // Check file size (via buffer)
  // Check filename not empty
  // Check userId valid UUID
  // Check contentType is reasonable
  // Throw FileExtractionError if invalid
}
```

---

### File: test-file-processor.js

**Size Estimate**: 400-600 lines

**Test Framework**: Plain Node.js with async/await (matching Chunk 4 style)

**Test Suite**: 8 test cases

#### Test 1: End-to-End File Processing
**Input**: Small test file (simple text with strategy data)
**Verification**:
- File record created in database
- All fields populated correctly
- Status=ready, progress=100
- Embedding is 1024-dim array
- Description is compressed text
- No errors thrown

#### Test 2: Duplicate File Detection
**Input**: Same file uploaded twice
**Verification**:
- First upload: succeeds, creates record
- Second upload: throws DUPLICATE_FILE error
- Only one record in database

#### Test 3: Large File (near 10MB limit)
**Input**: File at 9.9MB
**Verification**:
- Processes successfully
- No FILE_TOO_LARGE error

#### Test 4: File Over Size Limit
**Input**: File at 10.1MB
**Verification**:
- Throws FileProcessorError with code VALIDATION_ERROR
- No database record created
- Error message mentions file size

#### Test 5: Progress Callbacks
**Input**: File with onProgress callback
**Verification**:
- Callback called multiple times
- Progress values increase from 0-100
- Stages reported in correct order: extraction → compression → embedding → finalization
- Final callback has progress=100

#### Test 6: Invalid User ID
**Input**: File with invalid user UUID
**Verification**:
- Throws FileProcessorError with code VALIDATION_ERROR
- No database record created
- Error mentions invalid user_id

#### Test 7: Database Insertion Failure Simulation
**Input**: Normal file, but simulate DB insert error
**Verification**:
- FileProcessorError thrown with code DATABASE_ERROR
- Error includes original database error details
- No partial data in database

#### Test 8: Compression Error Handling
**Input**: File that causes compression to fail
**Verification**:
- File record created with status=pending
- After compression error: status=failed, error_message set
- Error code=COMPRESSION_ERROR, stage=compression
- Database record saved for debugging

---

## Testing Strategy

### Preparation
```bash
# Ensure .env has all required keys
export FIREWORKS_API_KEY=...
export VOYAGE_API_KEY=...
export PUBLIC_SUPABASE_URL=...
export PUBLIC_SUPABASE_ANON_KEY=...

# Run tests
npx tsx test-file-processor.js
```

### Test Execution Order
1. Start with basic end-to-end test
2. Then error scenarios
3. Then edge cases (size limits, duplicates)
4. Finally progress callback integration

### Verification Checklist for Each Test
- ✓ Return value correct type
- ✓ Database record created with expected fields
- ✓ No partial data on failure
- ✓ Error code appropriate to failure type
- ✓ Error message descriptive
- ✓ Progress callbacks (if used) called with correct values

### Manual Testing
After automated tests pass:
```bash
# Test in SvelteKit environment
npm run dev
# Manually upload a file via UI (when Chunk 6 implemented)
# Verify real-time progress updates via browser console
```

---

## Integration Points

### Input From Previous Chunks

**Chunk 2 (File Extraction)**:
- Calls `extractText()` to get text + metadata
- Uses `validateFileSize()` for size checking
- Uses `generateContentHash()` for deduplication
- Imports `FileType` enum and `ExtractionResult`
- Catches `FileExtractionError`

**Chunk 4 (File Compressor)**:
- Calls `compressFile()` with extraction result
- Receives `CompressionResult` with description
- Catches `FileCompressionError`

**Chunk 3 (Vectorization)**:
- Calls `generateEmbedding()` with compressed description
- Receives 1024-dim number array
- Catches `VectorizationError`

**Chunk 1 (Database)**:
- Inserts into `files` table with all 13 fields
- Uses Supabase client for database operations
- Handles VECTOR type for embedding column
- Uses file_status_enum, processing_stage_enum, file_type_enum

### Output to Later Chunks

**Chunk 6 (API Endpoints)**:
- API will call `processFile()` from upload endpoint
- API will receive `ProcessFileOutput` with file ID
- API will fire-and-forget: trigger processing in background
- Returns file ID immediately to user

**Chunk 7 (Server-Sent Events)**:
- SSE endpoint will subscribe to progress callbacks
- Calls `processFile()` with onProgress callback
- Callback pushes updates to SSE stream
- Frontend receives real-time progress events

**Chunk 10 (Context Injection)**:
- Context builder will query files table
- Filters: status='ready', user_id=current_user
- Uses description field (from Chunk 4 compression)
- Uses embedding field (from Chunk 3) for semantic search

---

## Success Criteria

### Functional Requirements
- ✓ `processFile()` orchestrates complete pipeline (extract → compress → embed → store)
- ✓ Progress tracked from 0-100% with stage updates
- ✓ All-or-nothing pattern: no partial data on failure
- ✓ File records created with all 13 fields populated
- ✓ Duplicate detection via content_hash (configurable skip)
- ✓ Error handling with descriptive codes and messages
- ✓ Database operations use Supabase client correctly
- ✓ Callback hooks for real-time progress updates

### Error Handling
- ✓ FileProcessorError thrown with appropriate code
- ✓ Error stage indicated in error object
- ✓ Validation errors don't create database records
- ✓ Processing errors update database with status=failed
- ✓ Error messages are descriptive and actionable
- ✓ Original error details preserved in details field

### Code Quality
- ✓ TypeScript compiles without errors
- ✓ All functions have JSDoc comments
- ✓ Error classes properly defined
- ✓ Type safety throughout (no unsafe 'any')
- ✓ No hardcoded values (except stage names, which are domain-specific)
- ✓ Follows existing project patterns
- ✓ Proper async/await usage

### Testing
- ✓ All 8 test cases pass
- ✓ End-to-end happy path works
- ✓ Error scenarios handled correctly
- ✓ Edge cases (size limits, duplicates) covered
- ✓ Database operations verified
- ✓ Progress callbacks functional

### Integration
- ✓ Imports from Chunks 2, 3, 4 work correctly
- ✓ Database operations match files table schema
- ✓ Supabase client used properly
- ✓ Error types are compatible with API usage (Chunk 6)
- ✓ Progress callback interface suitable for SSE (Chunk 7)

---

## Risk Mitigation

### Risk 1: Long-Running Processing Times
**Risk**: Processing takes 10-30 seconds; UI might timeout
**Mitigation**:
- Use fire-and-forget pattern in API (Chunk 6)
- Return file ID immediately
- Real-time progress via SSE (Chunk 7)
- Database reflects status in real-time

### Risk 2: External API Failures
**Risk**: Fireworks or Voyage AI might be unavailable
**Mitigation**:
- Each API call wrapped in try-catch
- Specific error codes for rate limits, auth, network errors
- Detailed error messages in database
- User can see failed status and retry later

### Risk 3: Database Consistency
**Risk**: Partial data if database operation fails
**Mitigation**:
- Pre-create record before expensive operations
- Update progressively; failures update existing record
- No delete operations (only insert/update)
- Supabase handles transaction isolation

### Risk 4: Duplicate File Uploads
**Risk**: User uploads same file multiple times
**Mitigation**:
- Content hash check before processing
- Reject duplicates with clear error message
- Skip check only for testing with skipDuplicateCheck flag

---

## Code Examples

### Basic Usage

```typescript
import { processFile } from '$lib/file-processor';

const file = await req.blob();
const buffer = Buffer.from(await file.arrayBuffer());

const result = await processFile({
  fileBuffer: buffer,
  filename: 'strategic-plan.pdf',
  userId: 'user-uuid-here',
  contentType: file.type
});

console.log(result.id); // File ID for future reference
```

### With Progress Callback

```typescript
const result = await processFile(
  {
    fileBuffer: buffer,
    filename: 'data.xlsx',
    userId: userId,
    contentType: 'application/vnd.ms-excel'
  },
  {
    onProgress: (update) => {
      console.log(`[${update.stage}] ${update.progress}% - ${update.message}`);
    }
  }
);
```

### Error Handling

```typescript
try {
  const result = await processFile({ ... });

  if (result.status === 'ready') {
    console.log('File processed successfully');
  } else {
    console.log(`Processing failed: ${result.error?.message}`);
    console.log(`Stage: ${result.error?.stage}`);
  }
} catch (error) {
  if (error instanceof FileProcessorError) {
    console.log(`Error code: ${error.code}`);
    console.log(`Error stage: ${error.stage}`);
    // Handle specific error codes
  }
}
```

---

## Implementation Notes

### Constants to Define

```typescript
// Progress values for each stage
const PROGRESS_MAP = {
  extraction_start: 0,
  extraction_end: 25,
  compression_start: 25,
  compression_end: 75,
  embedding_start: 75,
  embedding_end: 90,
  finalization_start: 90,
  finalization_end: 100
};

// Processing stage enum (matches Chunk 1 database enum)
type ProcessingStage = 'extraction' | 'compression' | 'embedding' | 'finalization';

// Error codes (comprehensive list)
type FileProcessorErrorCode =
  | 'VALIDATION_ERROR'
  | 'EXTRACTION_ERROR'
  | 'COMPRESSION_ERROR'
  | 'EMBEDDING_ERROR'
  | 'DUPLICATE_FILE'
  | 'DATABASE_ERROR'
  | 'UNKNOWN_ERROR';
```

### Database Field Mapping

When inserting into `files` table:
```typescript
{
  id: generated by database,
  user_id: from input.userId,
  filename: from input.filename,
  file_type: from extractText() result,
  content_hash: from generateContentHash(),
  description: from compressFile() result,
  embedding: from generateEmbedding() result,
  status: 'ready' on success, 'failed' on error,
  processing_stage: final stage completed,
  progress: 100 on success, current on error,
  error_message: error description on failure,
  uploaded_at: auto-set by database,
  updated_at: auto-set by database
}
```

### Type Safety with Supabase

```typescript
// Define interface matching files table schema
interface FileRecord {
  id: string;
  user_id: string;
  filename: string;
  file_type: FileType;
  content_hash: string;
  description: string | null;
  embedding: number[] | null;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  processing_stage: 'extraction' | 'compression' | 'embedding' | 'finalization' | null;
  progress: number;
  error_message: string | null;
  uploaded_at: string;
  updated_at: string;
}

// Use with Supabase operations
const { data, error } = await supabase
  .from('files')
  .insert([fileRecord as FileRecord])
  .select();
```

---

## Summary

The File Processor orchestration layer provides a robust, fault-tolerant pipeline for processing uploaded files. It:

1. **Coordinates** all processing steps (extract → compress → embed → store)
2. **Tracks progress** in real-time with stage indicators
3. **Ensures safety** via all-or-nothing pattern
4. **Handles errors** gracefully with descriptive codes
5. **Prevents duplicates** via content hash checking
6. **Integrates seamlessly** with Chunks 2, 3, 4 (input) and Chunks 6, 7, 10 (output)

The implementation will be clean, well-tested, and ready for integration with the API and SSE layers.

---

**Next Steps**:
1. Reviewer feedback on this plan
2. Implementation once plan reaches 10/10
3. Testing with all 8 test cases
4. Integration with Chunk 6 (API Endpoints)
