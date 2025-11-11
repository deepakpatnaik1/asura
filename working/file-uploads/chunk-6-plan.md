# Chunk 6 Plan: API Endpoints

## Status
Draft

## Overview

Implement HTTP API endpoints for file upload, listing, retrieval, and deletion. The endpoints provide the REST interface between the frontend UI and the file processing backend (Chunk 5). This chunk focuses on request validation, authentication, database queries, and response formatting.

## Dependencies

- **Chunk 1**: Database schema (`files` table)
- **Chunk 2**: File extraction library (`extractText()`, types)
- **Chunk 3**: Vectorization library (types)
- **Chunk 4**: File compressor library (types)
- **Chunk 5**: File processor orchestration (`processFile()`)
- **SvelteKit**: Request/response handling, route definitions, form data parsing
- **Supabase**: Database client, RLS policies
- **Node.js**: Built-in `formidable` (file upload parsing) or `busboy` or manual form parsing

## Design Decisions

### 1. Route Structure

**Decision**: Follow SvelteKit 2.x server route conventions with nested directories.

**Route Layout**:
```
src/routes/api/
├── files/
│   ├── +server.ts          (GET /api/files - list, POST for future batch)
│   ├── upload/
│   │   └── +server.ts      (POST /api/files/upload - single file upload)
│   └── [id]/
│       └── +server.ts      (GET /api/files/[id], DELETE /api/files/[id])
```

**Rationale**:
- Follows existing pattern in codebase (see `/api/chat/+server.ts`)
- Nested routes maintain semantic API structure
- Dynamic `[id]` parameter for file-specific operations
- Clean separation of concerns per route

### 2. Authentication Pattern

**Decision**: Extract `user_id` from authentication context (prepared for future auth integration).

**Current Implementation** (development):
- Use `null` for `user_id` (placeholder, awaits Google Auth integration)
- Note in comments that this will be replaced with proper auth extraction

**Future Implementation** (after Chunk 11: Auth):
- Extract from `request.locals.user.id` (SvelteKit hooks pattern)
- Or use Supabase session: `const user = await supabase.auth.getUser()`
- Validate that user_id is present and valid UUID

**Authorization**:
- GET /api/files: Return only files for authenticated user
- GET /api/files/[id]: Verify file belongs to user before returning
- DELETE /api/files/[id]: Verify file belongs to user before deleting
- RLS policies in database enforce this as backup

**Code Pattern**:
```typescript
// Extract user_id (currently null, will be updated post-auth)
const userId = null; // TODO: Extract from request.locals or supabase auth

if (!userId) {
  return json({ error: 'Authentication required' }, { status: 401 });
}
```

### 3. File Upload Handling (POST /api/files/upload)

**Decision**: Use SvelteKit's built-in form data parsing with `request.formData()`.

**Form Data Structure**:
```
POST /api/files/upload
Content-Type: multipart/form-data

file: <binary file content>
```

**Parsing Approach**:
1. Get form data from `request.formData()`
2. Extract file from form data using `.get('file')` which returns `File` object
3. Convert `File` to `Buffer` using `Buffer.from(await file.arrayBuffer())`
4. Extract filename from `file.name` property
5. Extract content type from `file.type` property

**Validation**:
- File presence check
- File size validation (10MB limit) - delegated to `processFile()`
- File name validation (non-empty)
- Content-Type check (informational, not strict filtering)

**Error Responses**:
- 400: Missing file or filename
- 413: File too large (if detected before processFile)
- 400: Invalid file type (if needed)

### 4. Error Response Format

**Decision**: Use consistent JSON error response format across all endpoints.

**Success Response** (2xx):
```typescript
{
  success: true,
  data: { /* endpoint-specific data */ }
}
```

**Error Response** (4xx/5xx):
```typescript
{
  error: {
    message: string;        // User-friendly error message
    code: string;           // Machine-readable error code
    details?: any;          // Additional context (optional)
  }
}
```

**Examples**:
```typescript
// File upload success
{
  success: true,
  data: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    filename: "document.pdf",
    status: "pending"
  }
}

// Validation error
{
  error: {
    message: "File size exceeds 10MB limit",
    code: "FILE_TOO_LARGE"
  }
}

// Database error
{
  error: {
    message: "Failed to process file",
    code: "DATABASE_ERROR",
    details: { originalError: "..." }
  }
}
```

### 5. Progress Reporting Integration (Chunk 7 Placeholder)

**Decision**: API endpoints create database records; progress tracking is handled by Chunk 7 (SSE) which polls/listens to the `files` table.

**Current Chunk 6 Implementation**:
- Upload endpoint creates file record with `status: pending`
- Returns immediately with file ID
- Does NOT wait for processing to complete
- Processing happens asynchronously via Chunk 5

**Chunk 7 Integration Point** (future):
- SSE endpoint will subscribe to `files` table changes
- Frontend will listen for real-time progress updates via SSE
- No changes needed in Chunk 6 for this integration

**Progress Flow**:
```
POST /api/files/upload
↓ (immediate response with file_id)
↓ (background: processFile() updates progress in DB)
↓ (real-time: Chunk 7 SSE streams updates to frontend)
```

### 6. Database Queries

**Decision**: Use Supabase JavaScript client with straightforward query builders.

**Query Patterns**:

**GET /api/files** (list):
```typescript
supabase
  .from('files')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
```

**GET /api/files/[id]** (detail):
```typescript
supabase
  .from('files')
  .select('*')
  .eq('id', id)
  .eq('user_id', userId)
  .single()
```

**DELETE /api/files/[id]**:
```typescript
supabase
  .from('files')
  .delete()
  .eq('id', id)
  .eq('user_id', userId)
```

## Implementation

### File: `src/routes/api/files/upload/+server.ts`

**Purpose**: Handle file upload, validation, and initiate processing

**Handler**: POST

**Complete Implementation**:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import { processFile } from '$lib/file-processor';
import { validateFileSize } from '$lib/file-extraction';

// Maximum file size: 10MB
const MAX_FILE_SIZE_MB = 10;

export const POST: RequestHandler = async ({ request }) => {
  try {
    // 1. AUTHENTICATION CHECK
    // TODO: Replace with actual auth extraction after Chunk 11
    const userId = null;

    if (!userId) {
      return json(
        {
          error: {
            message: 'Authentication required',
            code: 'AUTH_REQUIRED'
          }
        },
        { status: 401 }
      );
    }

    // 2. PARSE FORM DATA
    let file: File;
    try {
      const formData = await request.formData();
      const uploadedFile = formData.get('file');

      if (!uploadedFile || !(uploadedFile instanceof File)) {
        return json(
          {
            error: {
              message: 'No file provided in request',
              code: 'NO_FILE'
            }
          },
          { status: 400 }
        );
      }

      file = uploadedFile;
    } catch (parseError) {
      return json(
        {
          error: {
            message: 'Failed to parse multipart form data',
            code: 'FORM_PARSE_ERROR',
            details: parseError instanceof Error ? parseError.message : 'Unknown error'
          }
        },
        { status: 400 }
      );
    }

    // 3. VALIDATE FILE
    const { filename, size, type: contentType } = file;

    if (!filename || filename.trim().length === 0) {
      return json(
        {
          error: {
            message: 'File must have a non-empty filename',
            code: 'INVALID_FILENAME'
          }
        },
        { status: 400 }
      );
    }

    // Check file size (basic check; processFile() will also validate)
    const fileSizeMb = size / (1024 * 1024);
    if (fileSizeMb > MAX_FILE_SIZE_MB) {
      return json(
        {
          error: {
            message: `File size (${fileSizeMb.toFixed(2)}MB) exceeds maximum of ${MAX_FILE_SIZE_MB}MB`,
            code: 'FILE_TOO_LARGE'
          }
        },
        { status: 413 }
      );
    }

    // 4. CONVERT FILE TO BUFFER
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(await file.arrayBuffer());
    } catch (bufferError) {
      return json(
        {
          error: {
            message: 'Failed to read file content',
            code: 'FILE_READ_ERROR',
            details: bufferError instanceof Error ? bufferError.message : 'Unknown error'
          }
        },
        { status: 400 }
      );
    }

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

    // 6. RETURN SUCCESS WITH FILE ID
    // Note: File will be in "pending" status initially
    // Processing stage updates will be available via Chunk 7 (SSE)
    return json(
      {
        success: true,
        data: {
          id: 'pending-id-placeholder', // Will be set by processFile()
          filename,
          fileSize: size,
          status: 'pending',
          message: 'File upload started. Processing in background.'
        }
      },
      { status: 202 } // 202 Accepted - processing started
    );

  } catch (error) {
    console.error('[Upload API] Unexpected error:', error);
    return json(
      {
        error: {
          message: 'Unexpected error during file upload',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    );
  }
};
```

**Status Code Notes**:
- `202 Accepted`: File received and queued for processing (async)
- `400 Bad Request`: Validation errors (missing file, invalid filename, parse errors)
- `413 Payload Too Large`: File size exceeds limit
- `401 Unauthorized`: Not authenticated
- `500 Internal Server Error`: Unexpected server error

**Key Design Points**:
- Fire-and-forget processing: returns immediately, doesn't wait for processing
- Background processing errors are logged but don't fail the response
- File ID placeholder returned (processFile() will create actual DB record)
- Duplicate checking happens inside processFile()

---

### File: `src/routes/api/files/+server.ts`

**Purpose**: List all files for authenticated user

**Handler**: GET

**Complete Implementation**:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

export const GET: RequestHandler = async ({ url }) => {
  try {
    // 1. AUTHENTICATION CHECK
    // TODO: Replace with actual auth extraction after Chunk 11
    const userId = null;

    if (!userId) {
      return json(
        {
          error: {
            message: 'Authentication required',
            code: 'AUTH_REQUIRED'
          }
        },
        { status: 401 }
      );
    }

    // 2. PARSE QUERY PARAMETERS
    const statusFilter = url.searchParams.get('status');

    // Validate status filter if provided
    const validStatuses = ['pending', 'processing', 'ready', 'failed'];
    if (statusFilter && !validStatuses.includes(statusFilter)) {
      return json(
        {
          error: {
            message: `Invalid status filter. Must be one of: ${validStatuses.join(', ')}`,
            code: 'INVALID_STATUS_FILTER'
          }
        },
        { status: 400 }
      );
    }

    // 3. QUERY DATABASE
    let query = supabase
      .from('files')
      .select('id, filename, file_type, status, progress, processing_stage, error_message, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Apply status filter if provided
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: files, error } = await query;

    if (error) {
      console.error('[List API] Database query error:', error);
      return json(
        {
          error: {
            message: 'Failed to retrieve file list',
            code: 'DATABASE_ERROR',
            details: error.message
          }
        },
        { status: 500 }
      );
    }

    // 4. RETURN SUCCESS
    return json({
      success: true,
      data: {
        files: files || [],
        count: (files || []).length
      }
    });

  } catch (error) {
    console.error('[List API] Unexpected error:', error);
    return json(
      {
        error: {
          message: 'Unexpected error while listing files',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    );
  }
};
```

**Query Parameters**:
- `status` (optional): Filter by status (pending|processing|ready|failed)
- Example: `GET /api/files?status=ready`

**Response Format**:
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "filename": "document.pdf",
        "file_type": "pdf",
        "status": "ready",
        "progress": 100,
        "processing_stage": "finalization",
        "error_message": null,
        "created_at": "2025-11-11T10:30:00Z",
        "updated_at": "2025-11-11T10:32:00Z"
      }
    ],
    "count": 1
  }
}
```

**Status Code Notes**:
- `200 OK`: Success
- `400 Bad Request`: Invalid status filter
- `401 Unauthorized`: Not authenticated
- `500 Internal Server Error`: Database error or unexpected error

---

### File: `src/routes/api/files/[id]/+server.ts`

**Purpose**: Get file details or delete a file

**Handlers**: GET, DELETE

**Complete Implementation**:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

// Helper function to validate UUID format
function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// GET: Retrieve file details
export const GET: RequestHandler = async ({ params }) => {
  try {
    // 1. AUTHENTICATION CHECK
    // TODO: Replace with actual auth extraction after Chunk 11
    const userId = null;

    if (!userId) {
      return json(
        {
          error: {
            message: 'Authentication required',
            code: 'AUTH_REQUIRED'
          }
        },
        { status: 401 }
      );
    }

    // 2. VALIDATE FILE ID
    const { id } = params;
    if (!isValidUUID(id)) {
      return json(
        {
          error: {
            message: 'Invalid file ID format',
            code: 'INVALID_FILE_ID'
          }
        },
        { status: 400 }
      );
    }

    // 3. QUERY DATABASE
    const { data: file, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      // Supabase returns specific error when row not found
      if (error.code === 'PGRST116') {
        return json(
          {
            error: {
              message: 'File not found',
              code: 'FILE_NOT_FOUND'
            }
          },
          { status: 404 }
        );
      }

      console.error('[Get File API] Database query error:', error);
      return json(
        {
          error: {
            message: 'Failed to retrieve file details',
            code: 'DATABASE_ERROR',
            details: error.message
          }
        },
        { status: 500 }
      );
    }

    // 4. RETURN SUCCESS
    return json({
      success: true,
      data: file
    });

  } catch (error) {
    console.error('[Get File API] Unexpected error:', error);
    return json(
      {
        error: {
          message: 'Unexpected error while retrieving file',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    );
  }
};

// DELETE: Delete a file
export const DELETE: RequestHandler = async ({ params }) => {
  try {
    // 1. AUTHENTICATION CHECK
    // TODO: Replace with actual auth extraction after Chunk 11
    const userId = null;

    if (!userId) {
      return json(
        {
          error: {
            message: 'Authentication required',
            code: 'AUTH_REQUIRED'
          }
        },
        { status: 401 }
      );
    }

    // 2. VALIDATE FILE ID
    const { id } = params;
    if (!isValidUUID(id)) {
      return json(
        {
          error: {
            message: 'Invalid file ID format',
            code: 'INVALID_FILE_ID'
          }
        },
        { status: 400 }
      );
    }

    // 3. VERIFY OWNERSHIP (security check before delete)
    // Query to ensure file belongs to user
    const { data: file, error: queryError } = await supabase
      .from('files')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (queryError) {
      // File not found or doesn't belong to user
      if (queryError.code === 'PGRST116') {
        return json(
          {
            error: {
              message: 'File not found',
              code: 'FILE_NOT_FOUND'
            }
          },
          { status: 404 }
        );
      }

      console.error('[Delete File API] Ownership check error:', queryError);
      return json(
        {
          error: {
            message: 'Failed to verify file ownership',
            code: 'DATABASE_ERROR',
            details: queryError.message
          }
        },
        { status: 500 }
      );
    }

    // 4. DELETE FILE
    const { error: deleteError } = await supabase
      .from('files')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('[Delete File API] Delete error:', deleteError);
      return json(
        {
          error: {
            message: 'Failed to delete file',
            code: 'DELETE_ERROR',
            details: deleteError.message
          }
        },
        { status: 500 }
      );
    }

    // 5. RETURN SUCCESS
    return json({
      success: true,
      data: {
        message: 'File deleted successfully',
        id
      }
    });

  } catch (error) {
    console.error('[Delete File API] Unexpected error:', error);
    return json(
      {
        error: {
          message: 'Unexpected error while deleting file',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    );
  }
};
```

**GET Response Format**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user-uuid",
    "filename": "document.pdf",
    "file_type": "pdf",
    "content_hash": "sha256hash...",
    "description": "Compressed file description...",
    "embedding": [0.1, 0.2, ...], // 1024-dimensional vector
    "status": "ready",
    "processing_stage": "finalization",
    "progress": 100,
    "error_message": null,
    "created_at": "2025-11-11T10:30:00Z",
    "updated_at": "2025-11-11T10:32:00Z"
  }
}
```

**DELETE Response Format**:
```json
{
  "success": true,
  "data": {
    "message": "File deleted successfully",
    "id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Status Codes**:
- `200 OK`: Success (GET/DELETE)
- `400 Bad Request`: Invalid file ID format
- `404 Not Found`: File not found or doesn't belong to user
- `401 Unauthorized`: Not authenticated
- `500 Internal Server Error`: Database error

---

## Testing Strategy

### Unit Tests
- Not applicable for API routes (SvelteKit routes are integration tests)

### Integration Tests (manual testing)

**1. File Upload Test**
```bash
curl -X POST http://localhost:5173/api/files/upload \
  -F "file=@document.pdf"
```
Expected: 202 Accepted with pending status

**2. List Files Test**
```bash
curl http://localhost:5173/api/files
```
Expected: 200 OK with empty array (no files uploaded)

**3. Get File Details Test**
```bash
curl http://localhost:5173/api/files/550e8400-e29b-41d4-a716-446655440000
```
Expected: 200 OK with file details OR 404 Not Found

**4. Delete File Test**
```bash
curl -X DELETE http://localhost:5173/api/files/550e8400-e29b-41d4-a716-446655440000
```
Expected: 200 OK with success message

**5. Error Cases**
- Missing file in upload: 400 Bad Request
- Invalid file ID: 400 Bad Request
- File not found: 404 Not Found
- File too large: 413 Payload Too Large

### Testing Notes
- Currently no authentication, so userId = null will cause 401 on all endpoints
- After Chunk 11 (Auth), can test with proper user context
- Use curl, Postman, or Playwright tests for integration testing

## Integration Points

### Inputs to Chunk 6

**From Chunk 5 (File Processor)**:
- ✓ Import: `processFile()` function
- ✓ Signature: `async (input: ProcessFileInput, options?: ProcessFileOptions): Promise<ProcessFileOutput>`
- ✓ Usage: Call in upload endpoint to initiate background processing

**From Chunk 1 (Database)**:
- ✓ `files` table exists with schema (13 fields)
- ✓ Row-level security enabled for user isolation
- ✓ Indexes on user_id, status, created_at

**From SvelteKit**:
- ✓ `request.formData()` for multipart form parsing
- ✓ `request.url.searchParams` for query parameters
- ✓ Dynamic route parameters via `params` object
- ✓ JSON response helpers

### Outputs from Chunk 6

**To Chunk 7 (Server-Sent Events)**:
- ✓ File records created in database with progress tracking
- ✓ SSE can subscribe to `files` table changes
- ✓ Real-time updates available via database subscriptions

**To Chunk 8 (Files Store)**:
- ✓ GET /api/files endpoint returns file list
- ✓ File objects have all necessary fields (status, progress, error_message)
- ✓ Pagination ready (sorting by created_at)

**To Chunk 9 (UI Integration)**:
- ✓ Upload endpoint accepts multipart/form-data
- ✓ List endpoint returns files with status indicators
- ✓ Delete endpoint supports file removal
- ✓ Error responses in consistent format

## Success Criteria

- [ ] POST /api/files/upload accepts file, validates, initiates processing
- [ ] GET /api/files returns user's files with filtering by status
- [ ] GET /api/files/[id] returns specific file details with ownership check
- [ ] DELETE /api/files/[id] deletes file with ownership verification
- [ ] Authentication checks on all endpoints (currently returns 401 since no auth)
- [ ] Error responses follow consistent JSON format
- [ ] File size limit (10MB) enforced with proper error message
- [ ] Query parameter validation (status filter)
- [ ] UUID validation for file IDs
- [ ] All 3 routes created at correct SvelteKit paths
- [ ] TypeScript compilation passes with no errors
- [ ] Proper error handling and logging on all paths

## Edge Cases & Error Handling

### Upload Endpoint Edge Cases
1. Missing file in form data: 400
2. Empty filename: 400
3. File too large (>10MB): 413
4. Duplicate file detected (in processFile): Will be handled by Chunk 5, DB record marked as failed
5. Processing errors during background execution: Logged, DB record marked as failed
6. Malformed form data: 400 with parse error

### List Endpoint Edge Cases
1. No files uploaded yet: 200 with empty array
2. Invalid status filter: 400 with validation error
3. Database connection error: 500
4. Empty result set: 200 with empty array and count=0

### Get/Delete Endpoint Edge Cases
1. Invalid UUID format: 400
2. File doesn't exist: 404
3. File belongs to different user (authorization): 404 (don't leak existence)
4. Database error: 500
5. File being processed: Still retrievable/deletable

## Notes

- **Authentication**: Currently uses `null` userId as placeholder. Will be updated in Chunk 11 (Auth integration).
- **RLS Policies**: Database has row-level security enabled. Backup to API-level authorization checks.
- **Cascade Deletes**: Database schema handles cascade delete of related records.
- **No Hardcoded Values**: All error codes, field names, and status values defined as constants or domain terms.
- **Fire-and-Forget Pattern**: Upload endpoint doesn't wait for processing to complete, returns immediately.
- **Progress Tracking**: Handled by Chunk 7 (SSE), not by these endpoints. Endpoints only create records and return IDs.

