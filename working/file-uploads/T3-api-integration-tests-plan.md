# T3: API Integration Tests - Implementation Plan

## Status: Ready for Review

## Context

- **T1 Complete**: 105/105 unit tests passing
- **T2 Complete**: 102/102 database tests passing
- **Test infrastructure**: Solid foundation with Vitest, test helpers, and Supabase access
- **Critical Issue Identified**: All API endpoints have `userId = null` with TODO comments, returning 401 Unauthorized

## Problem: Authentication Not Implemented

All API endpoints have this pattern:
```typescript
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
```

**Testing Challenge**: Cannot test endpoints normally because they always return 401.

## Solution: Test Request Handler Pattern

Instead of testing endpoints via HTTP (which is blocked by auth), we'll test the **request handlers directly** by:

1. **Import the RequestHandler functions** directly (POST, GET, DELETE)
2. **Create mock Request objects** with test data
3. **Call handlers directly** with mocked context
4. **Mock the authentication check** to provide test userId
5. **Verify database state** after each operation

This approach:
- Tests the actual endpoint logic without HTTP layer
- Bypasses authentication temporarily for testing
- Validates all business logic, validation, and database operations
- Is a standard pattern for testing SvelteKit endpoints

## Alternative Considered: Modify Endpoints

We could modify endpoints to accept a test header:
```typescript
const userId = request.headers.get('x-test-user-id') || null;
```

**Rejected because**:
- Requires modifying production code for tests
- Creates security risk if accidentally left in production
- Less clean separation of concerns

## Test Structure

### Files to Create

```
tests/integration/api/
├── upload-endpoint.test.ts        # POST /api/files/upload
├── list-endpoint.test.ts          # GET /api/files
├── get-endpoint.test.ts           # GET /api/files/[id]
├── delete-endpoint.test.ts        # DELETE /api/files/[id]
└── sse-endpoint.test.ts           # GET /api/files/events
```

### Test Approach: Mock Request Pattern

For each endpoint test:

```typescript
import { POST } from '$lib/routes/api/files/upload/+server';
import { vi } from 'vitest';

// 1. Mock the authentication to provide test userId
vi.mock('$lib/auth', () => ({
  getUserId: () => 'test-user-id'
}));

// 2. Create mock Request object
const formData = new FormData();
formData.append('file', testFile);

const mockRequest = new Request('http://localhost/api/files/upload', {
  method: 'POST',
  body: formData
});

// 3. Call handler directly
const response = await POST({ request: mockRequest, locals: {} });

// 4. Verify response
expect(response.status).toBe(202);

// 5. Verify database state
const { data } = await supabase.from('files').select('*').eq('user_id', testUserId);
expect(data).toHaveLength(1);
```

## Implementation Details

### 1. upload-endpoint.test.ts (Upload API)

**Test Coverage**:
- ✅ Upload valid text file
- ✅ Upload valid PDF file
- ✅ Upload valid image file
- ✅ Upload with duplicate content hash
- ✅ Reject file over 10MB size limit
- ✅ Reject missing file in FormData
- ✅ Reject invalid filename
- ✅ Verify database record created with status=pending
- ✅ Verify fire-and-forget (returns 202 before processing)
- ✅ Mock processFile to avoid LLM calls

**Code Structure**:
```typescript
describe('Upload API Endpoint', () => {
  const testUserId = generateTestId('user');
  const createdFileIds: string[] = [];

  beforeEach(() => {
    // Mock processFile to avoid LLM calls
    vi.mock('$lib/file-processor', () => ({
      processFile: vi.fn().mockResolvedValue({
        id: 'mock-file-id',
        status: 'ready'
      })
    }));
  });

  afterEach(async () => {
    // Clean up database
    for (const id of createdFileIds) {
      await supabase.from('files').delete().eq('id', id);
    }
    createdFileIds.length = 0;
  });

  it('should accept valid text file upload', async () => {
    // Test implementation
  });

  // ... more tests
});
```

**Key Points**:
- Must mock `processFile` to avoid calling Fireworks/Voyage APIs
- Must clean up test files from database
- Test both success and error paths
- Verify FormData parsing
- Verify file size validation
- Verify duplicate detection

### 2. list-endpoint.test.ts (List API)

**Test Coverage**:
- ✅ List all files for user
- ✅ Filter by status=pending
- ✅ Filter by status=processing
- ✅ Filter by status=ready
- ✅ Filter by status=failed
- ✅ Reject invalid status filter
- ✅ Empty results for user with no files
- ✅ User isolation (user A cannot see user B's files)
- ✅ Sorting by created_at DESC

**Code Structure**:
```typescript
describe('List API Endpoint', () => {
  const testUserId1 = generateTestId('user1');
  const testUserId2 = generateTestId('user2');
  const createdFileIds: string[] = [];

  afterEach(async () => {
    // Cleanup
  });

  it('should list all files for user', async () => {
    // Create test files
    const file1 = await insertTestFile(testUserId1, { status: 'ready' });
    const file2 = await insertTestFile(testUserId1, { status: 'processing' });

    // Call endpoint
    const response = await GET({ url: new URL('http://localhost/api/files') });

    // Verify response
    const json = await response.json();
    expect(json.data.files).toHaveLength(2);
  });

  // ... more tests
});
```

**Key Points**:
- Test with multiple files per user
- Test with multiple users (isolation)
- Test all status filters
- Test empty results
- Verify response format

### 3. get-endpoint.test.ts (Get Single File)

**Test Coverage**:
- ✅ Get file by valid ID
- ✅ Return complete file metadata
- ✅ 404 for non-existent file ID
- ✅ 404 for invalid UUID format
- ✅ 403 for file belonging to different user
- ✅ Verify all fields returned (id, filename, status, progress, etc.)

**Code Structure**:
```typescript
describe('Get File API Endpoint', () => {
  const testUserId = generateTestId('user');
  const createdFileIds: string[] = [];

  it('should return file by ID', async () => {
    // Create test file
    const file = await insertTestFile(testUserId);

    // Call endpoint
    const response = await GET({
      params: { id: file.id },
      locals: { userId: testUserId }
    });

    // Verify
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.id).toBe(file.id);
  });

  it('should return 404 for non-existent ID', async () => {
    const fakeId = '00000000-0000-0000-0000-999999999999';
    const response = await GET({ params: { id: fakeId } });
    expect(response.status).toBe(404);
  });

  // ... more tests
});
```

**Key Points**:
- Test both success and error paths
- Verify UUID validation
- Verify user authorization
- Verify complete response structure

### 4. delete-endpoint.test.ts (Delete API)

**Test Coverage**:
- ✅ Delete file by valid ID
- ✅ Verify file removed from database
- ✅ 404 for non-existent file ID
- ✅ 404 for invalid UUID format
- ✅ 403 for file belonging to different user
- ✅ Idempotent (deleting twice doesn't error)
- ✅ Verify ownership check before deletion

**Code Structure**:
```typescript
describe('Delete File API Endpoint', () => {
  const testUserId = generateTestId('user');

  it('should delete file by ID', async () => {
    // Create test file
    const file = await insertTestFile(testUserId);

    // Call endpoint
    const response = await DELETE({
      params: { id: file.id },
      locals: { userId: testUserId }
    });

    // Verify response
    expect(response.status).toBe(200);

    // Verify database deletion
    const { data } = await supabase
      .from('files')
      .select('*')
      .eq('id', file.id)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it('should return 404 for non-existent file', async () => {
    const fakeId = '00000000-0000-0000-0000-999999999999';
    const response = await DELETE({ params: { id: fakeId } });
    expect(response.status).toBe(404);
  });

  // ... more tests
});
```

**Key Points**:
- Verify database deletion
- Test ownership verification
- Test error paths
- Test idempotency

### 5. sse-endpoint.test.ts (Server-Sent Events)

**Test Coverage**:
- ✅ SSE connection establishes with proper headers
- ✅ Content-Type: text/event-stream
- ✅ Cache-Control: no-cache
- ✅ Connection: keep-alive
- ✅ Stream sends events in SSE format
- ✅ Event format validation (data: {json}\n\n)
- ✅ Heartbeat events sent periodically
- ✅ File update events triggered by database changes
- ✅ File delete events triggered by deletions
- ✅ Stream cleanup on disconnect

**Code Structure**:
```typescript
describe('SSE Events API Endpoint', () => {
  const testUserId = generateTestId('user');

  it('should establish SSE connection with correct headers', async () => {
    const response = await GET({
      request: new Request('http://localhost/api/files/events'),
      locals: { userId: testUserId }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('should send heartbeat events', async () => {
    // Start SSE connection
    const response = await GET({ locals: { userId: testUserId } });

    // Read stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    // Wait for heartbeat
    const { value } = await reader.read();
    const text = decoder.decode(value);

    expect(text).toContain('data: ');
    const event = JSON.parse(text.replace('data: ', ''));
    expect(event.eventType).toBe('heartbeat');
  });

  it('should send file-update events on database changes', async () => {
    // Connect to SSE
    const response = await GET({ locals: { userId: testUserId } });
    const reader = response.body.getReader();

    // Trigger database change
    await insertTestFile(testUserId);

    // Wait for event
    const { value } = await reader.read();
    const decoder = new TextDecoder();
    const text = decoder.decode(value);

    const event = JSON.parse(text.replace('data: ', ''));
    expect(event.eventType).toBe('file-update');
    expect(event.file).toBeDefined();
  });

  // ... more tests
});
```

**Key Points**:
- Test stream headers
- Test event format
- Test Supabase Realtime integration
- Test heartbeat mechanism
- Test cleanup on disconnect
- **Note**: SSE testing is complex; may need to mock ReadableStream

**Alternative Approach for SSE**:
Since testing SSE streams is complex, we can:
1. **Test headers only** - Verify correct Content-Type, Cache-Control
2. **Test stream creation** - Verify ReadableStream is returned
3. **Test Realtime subscription** - Mock Supabase Realtime and verify subscription setup
4. **Leave full E2E SSE testing to T5** (E2E tests with Playwright)

## Test Helpers

Create shared test helper functions:

```typescript
// tests/helpers/api-test-utils.ts

/**
 * Create a mock FormData with a test file
 */
export function createTestFileFormData(
  filename: string,
  content: string,
  contentType: string
): FormData {
  const file = new File([content], filename, { type: contentType });
  const formData = new FormData();
  formData.append('file', file);
  return formData;
}

/**
 * Create a test file record in database
 */
export async function insertTestFile(
  userId: string,
  overrides?: Partial<FileRecord>
): Promise<FileRecord> {
  const client = createTestSupabaseClient();
  const { data, error } = await client
    .from('files')
    .insert({
      user_id: userId,
      filename: 'test-file.txt',
      content_hash: generateTestId('hash'),
      file_type: 'text',
      status: 'pending',
      ...overrides
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Mock the authentication context for API endpoints
 */
export function mockAuthContext(userId: string) {
  return {
    locals: {
      userId
    }
  };
}
```

## Mock Strategy

### Critical: Mock External Services

To avoid costs and API rate limits, we MUST mock:

1. **file-processor.ts**: Mock `processFile()` to avoid calling LLM APIs
2. **file-compressor.ts**: Mock `compressFile()`
3. **vectorization.ts**: Mock `generateEmbedding()`
4. **Supabase Realtime**: Mock for SSE tests

```typescript
// Mock setup in test files
vi.mock('$lib/file-processor', () => ({
  processFile: vi.fn().mockResolvedValue({
    id: 'mock-id',
    filename: 'test.txt',
    fileType: 'text',
    status: 'ready'
  })
}));
```

## Authentication Workaround

Since all endpoints have `userId = null`, we have two options:

### Option A: Test the 401 Behavior (Simple)
```typescript
it('should return 401 when no authentication', async () => {
  const response = await POST({ request: mockRequest });
  expect(response.status).toBe(401);
  const json = await response.json();
  expect(json.error.code).toBe('AUTH_REQUIRED');
});
```

**Pros**: Tests actual current behavior
**Cons**: Cannot test core endpoint logic

### Option B: Temporarily Modify Endpoints for Testing (Recommended)

Create a test-specific version of endpoints:

```typescript
// tests/integration/api/test-endpoints/upload.ts
import { POST as OriginalPOST } from '$lib/routes/api/files/upload/+server';

export async function POST({ request, testUserId }) {
  // Override userId for testing
  const userId = testUserId;
  // ... rest of endpoint logic
}
```

**Pros**: Can test full endpoint logic
**Cons**: Requires duplicating endpoint code

### Option C: Module Mocking (Recommended)

Mock the authentication check at module level:

```typescript
import { POST } from '$lib/routes/api/files/upload/+server';
import { vi } from 'vitest';

describe('Upload Endpoint', () => {
  const testUserId = generateTestId('user');

  beforeEach(() => {
    // Mock module to inject test userId
    vi.mock('$lib/routes/api/files/upload/+server', async () => {
      const actual = await vi.importActual('$lib/routes/api/files/upload/+server');
      return {
        ...actual,
        POST: async ({ request }) => {
          // Inject test userId
          const mockRequest = {
            ...request,
            locals: { userId: testUserId }
          };
          return actual.POST({ request: mockRequest });
        }
      };
    });
  });
});
```

**Pros**: Tests actual endpoint code with minimal modification
**Cons**: More complex mocking setup

### **Decision: Option A for Now, Add TODO**

For this test phase, we'll:
1. **Test the 401 behavior** as-is
2. **Add comprehensive tests for all validation logic** we can test
3. **Add TODO comments** indicating these tests will be expanded once auth is implemented
4. **Focus on testing**:
   - Request parsing
   - Validation logic
   - Response format
   - Error handling

This approach:
- Tests real current behavior
- Documents what needs to be tested later
- Doesn't require modifying production code
- Provides value now

**Post-Auth Implementation**: Once authentication is added, we'll expand these tests to cover the full happy paths.

## Success Criteria

1. **5 test files created** in `tests/integration/api/`
2. **All tests passing** (expect ~25-30 tests total)
3. **401 behavior documented** and tested
4. **Validation logic tested** where possible without auth
5. **Database operations mocked** appropriately
6. **External API calls mocked** (no real LLM calls)
7. **Clear TODO comments** for post-auth test expansion
8. **Test coverage report** generated

## Test Count Estimate

- **upload-endpoint.test.ts**: 8-10 tests
- **list-endpoint.test.ts**: 6-8 tests
- **get-endpoint.test.ts**: 5-6 tests
- **delete-endpoint.test.ts**: 5-6 tests
- **sse-endpoint.test.ts**: 5-6 tests

**Total**: ~29-36 API integration tests

## Timeline

1. **Setup** (test helpers, mocks): 30 min
2. **upload-endpoint.test.ts**: 1 hour
3. **list-endpoint.test.ts**: 45 min
4. **get-endpoint.test.ts**: 45 min
5. **delete-endpoint.test.ts**: 45 min
6. **sse-endpoint.test.ts**: 1 hour
7. **Documentation & Summary**: 30 min

**Total Estimate**: 5-6 hours

## Next Steps After Approval

1. Create test helper file `tests/helpers/api-test-utils.ts`
2. Set up mock configuration
3. Implement tests file by file
4. Run tests and verify pass
5. Generate test report
6. Document results

## Open Questions

1. **Q**: Should we test the 401 behavior or skip testing until auth is implemented?
   **A**: Test 401 behavior, add TODOs for post-auth expansion

2. **Q**: Should we mock Supabase Realtime for SSE tests or test against real Realtime?
   **A**: Test against real Realtime if possible, fallback to mocking if flaky

3. **Q**: Should we test the fire-and-forget behavior of processFile()?
   **A**: Mock processFile() to verify it's called, don't wait for completion

4. **Q**: How do we handle file size limit testing (10MB files)?
   **A**: Create mock files with controlled sizes, don't upload real 10MB files

## Summary

This plan provides a comprehensive approach to API integration testing that:
- Works within current authentication constraints
- Tests real endpoint behavior
- Validates all testable logic paths
- Prepares for future auth implementation
- Avoids external API costs
- Maintains clean test isolation

The key insight is that we can test **validation, request parsing, response format, and error handling** even without auth, and document what needs full testing later.
