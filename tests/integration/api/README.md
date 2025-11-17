# API Integration Tests

Comprehensive API integration tests for the file upload feature.

## Test Coverage

### Current State: Pre-Auth (`userId = null`)

All API endpoints currently require authentication but return 401 since `userId = null`. These tests verify that:
- Authentication checks work correctly
- Request validation happens properly
- Response formats are correct
- Error handling is robust

### Test Files

1. **upload-endpoint.test.ts** - POST /api/files/upload
   - Authentication validation
   - Form data parsing
   - File validation (size, filename)
   - Response format
   - Error handling
   - 14 active tests + 4 skipped (for post-auth)

2. **list-endpoint.test.ts** - GET /api/files
   - Authentication validation
   - Query parameter parsing
   - Status filter validation
   - Response format
   - Error handling
   - 14 active tests + 8 skipped (for post-auth)

3. **get-endpoint.test.ts** - GET /api/files/[id]
   - Authentication validation
   - UUID format validation
   - Response format
   - Error handling
   - 13 active tests + 6 skipped (for post-auth)

4. **delete-endpoint.test.ts** - DELETE /api/files/[id]
   - Authentication validation
   - UUID format validation
   - Response format
   - Error handling
   - 13 active tests + 8 skipped (for post-auth)

5. **sse-endpoint.test.ts** - GET /api/files/events
   - Authentication validation
   - SSE headers validation
   - Event format validation
   - Response format
   - Error handling
   - 14 active tests + 12 skipped (for post-auth)

### Test Statistics

- **Total Active Tests**: 68
- **Total Skipped Tests**: 38 (marked with TODO for post-auth)
- **Total Test Files**: 5
- **All Active Tests**: PASSING ✅

### What We Test

#### Request Validation
- UUID format validation (8-4-4-4-12 pattern)
- File size validation (10MB limit)
- Filename validation (non-empty, non-whitespace)
- Query parameter validation (status filters)
- Form data parsing

#### Response Validation
- HTTP status codes (401, 400, 404, 500)
- Response structure (error object with message and code)
- Content-Type headers (application/json, text/event-stream)
- SSE-specific headers (Cache-Control, Connection)

#### Error Handling
- Empty/null parameters
- Malformed requests
- Invalid UUID formats
- Invalid status filters
- Missing required fields
- Unexpected errors

### Skipped Tests (Post-Auth Implementation)

Tests marked with `it.skip` are ready to be enabled after Chunk 11 (Google Auth) is complete:

- Successful upload flow
- File list retrieval
- Individual file retrieval
- File deletion
- SSE realtime updates
- Database integration
- User isolation

These tests are fully written and documented, just waiting for auth to be implemented.

### Running Tests

```bash
# Run all API integration tests
npm run test:integration -- tests/integration/api

# Run specific endpoint tests
npx vitest run tests/integration/api/upload-endpoint.test.ts
npx vitest run tests/integration/api/list-endpoint.test.ts
npx vitest run tests/integration/api/get-endpoint.test.ts
npx vitest run tests/integration/api/delete-endpoint.test.ts
npx vitest run tests/integration/api/sse-endpoint.test.ts
```

### Node Version Requirement

These tests require Node 22+ due to the `styleText` import in SvelteKit's Vite plugin.

```bash
nvm use 22
npm run test:integration -- tests/integration/api
```

### Design Philosophy

1. **Test what works now**: Focus on validation, parsing, and error handling that works with `userId = null`
2. **Document what's next**: Extensive TODOs for post-auth tests
3. **No production changes**: Tests work with existing code, no modifications needed
4. **Comprehensive coverage**: Every endpoint, every error path, every validation rule

### Next Steps (Post-Chunk 11)

After Google Auth is implemented:

1. Enable skipped tests by removing `.skip`
2. Update auth check expectations (401 → 200/202)
3. Add real user IDs to test cases
4. Verify user isolation works
5. Test complete request/response flows
6. Add database integration checks

### Related Documentation

- `/tests/README.md` - Overall test strategy
- `/tests/integration/database/` - Database integration tests (102 tests, all passing)
- `/tests/unit/` - Unit tests (105 tests, all passing)
