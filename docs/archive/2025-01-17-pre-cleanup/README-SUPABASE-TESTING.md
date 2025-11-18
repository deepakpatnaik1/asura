# Supabase Testing Guide

This guide explains how to use the Supabase service role key for testing against the remote Supabase instance.

## Overview

The test infrastructure is configured to use the **REMOTE** Supabase instance:
- **URL**: `https://hsxjcowijclwdxcmhbhs.supabase.co`
- **Authentication**: Service role key (bypasses RLS policies)
- **Environment**: Production database (use caution!)

## Configuration

### Environment Variables

All environment variables are loaded from the `.env` file in the project root:

```env
PUBLIC_SUPABASE_URL=https://hsxjcowijclwdxcmhbhs.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

These are automatically loaded by Vitest and validated in `tests/setup.ts`.

### Test Setup

The test setup (`tests/setup.ts`) performs the following:

1. Validates required environment variables exist
2. Logs connection information
3. Provides global test utilities via `@testing-library/jest-dom`

## Using the Database Helpers

### Import the Helpers

```typescript
import {
  createTestSupabaseClient,
  createAnonSupabaseClient,
  insertTestData,
  cleanupTestData,
  generateTestId,
  waitForDbOperation
} from '../helpers/database';
```

### Create a Supabase Client

#### Service Role Client (Bypasses RLS)

```typescript
const client = createTestSupabaseClient();

// Now you can query/insert/update/delete any data
const { data, error } = await client
  .from('models')
  .select('*');
```

#### Anon Client (Respects RLS)

```typescript
const client = createAnonSupabaseClient();

// This client respects RLS policies
const { data, error } = await client
  .from('models')
  .select('*');
```

### Insert Test Data

```typescript
// Single record
const testModel = {
  id: generateTestId('model'),
  model_name: 'Test Model',
  model_identifier: 'test/model',
  // ... other fields
};

const inserted = await insertTestData('models', testModel);

// Multiple records
const testModels = [
  { id: generateTestId('model'), ... },
  { id: generateTestId('model'), ... }
];

const insertedMultiple = await insertTestData('models', testModels);
```

### Clean Up Test Data

**IMPORTANT**: Always clean up test data to avoid polluting the database!

```typescript
// Clean up specific record
await cleanupTestData('models', { id: 'test-model-123' });

// Clean up multiple records with filter
await cleanupTestData('models', { model_name: 'Test Model' });

// NOTE: cleanupTestData requires a filter to prevent accidental deletion
// This will throw an error:
await cleanupTestData('models'); // ❌ ERROR!
```

### Generate Test IDs

Always prefix test data with unique IDs to avoid conflicts:

```typescript
const testId = generateTestId('model');
// Returns: "model-1762877793947-a8f9d3e"

const testModel = {
  id: testId,
  model_name: `Test Model ${testId}`,
  // ...
};
```

### Wait for Database Operations

Useful for testing eventual consistency or triggers:

```typescript
await waitForDbOperation(
  async () => {
    const { data } = await client
      .from('models')
      .select('id')
      .eq('id', testId)
      .single();

    return data !== null;
  },
  { timeout: 5000, interval: 100 }
);
```

## Example Test

Here's a complete example test:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestSupabaseClient,
  generateTestId,
  insertTestData,
  cleanupTestData
} from '../helpers';

describe('Model Tests', () => {
  let testModelId: string;

  beforeAll(() => {
    testModelId = generateTestId('test-model');
  });

  afterAll(async () => {
    // Clean up any test data
    await cleanupTestData('models', { id: testModelId });
  });

  it('should create and retrieve a model', async () => {
    const client = createTestSupabaseClient();

    // Insert test model
    const testModel = {
      id: testModelId,
      model_name: 'Test Model',
      model_identifier: 'test/model',
      context_window: 4096,
      max_output_tokens: 1024,
      cost_per_million_input_tokens: 0.1,
      cost_per_million_output_tokens: 0.2,
      is_active: true
    };

    await insertTestData('models', testModel);

    // Retrieve and verify
    const { data, error } = await client
      .from('models')
      .select('*')
      .eq('id', testModelId)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.model_name).toBe('Test Model');
  });
});
```

## Available Tables

Based on the current schema, these tables are available:

- ✅ `models` - AI model configurations
- ✅ `files` - File metadata

**Note**: Always query the table first to understand its structure, as the schema may change.

## Verification Script

You can verify the Supabase connection at any time:

```bash
npx tsx scripts/verify-supabase-connection.ts
```

This script will:
- Check environment variables
- Test service role authentication
- Query the models table
- Test storage access
- Verify the connection is working

## Best Practices

### 1. Always Use Test IDs

```typescript
// ✅ GOOD
const testId = generateTestId('my-test');

// ❌ BAD
const testId = 'test-123'; // May conflict with other tests
```

### 2. Clean Up After Tests

```typescript
// ✅ GOOD
afterAll(async () => {
  await cleanupTestData('models', { id: testModelId });
});

// ❌ BAD
// No cleanup - data stays in database!
```

### 3. Use Specific Filters

```typescript
// ✅ GOOD
await cleanupTestData('models', { id: testModelId });

// ❌ BAD
await cleanupTestData('models'); // Will throw error!
```

### 4. Isolate Test Data

```typescript
// ✅ GOOD - Each test has its own data
const testId1 = generateTestId('test1');
const testId2 = generateTestId('test2');

// ❌ BAD - Tests share data
const sharedId = 'test-123';
```

### 5. Handle Errors Gracefully

```typescript
// ✅ GOOD
const { data, error } = await client.from('models').select('*');
expect(error).toBeNull();

// ❌ BAD
const data = await client.from('models').select('*');
// May throw if error occurs
```

## Troubleshooting

### Environment Variables Not Found

**Error**: `Missing required environment variables`

**Solution**: Ensure `.env` file exists in project root with:
```env
PUBLIC_SUPABASE_URL=https://hsxjcowijclwdxcmhbhs.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

### Table Not Found

**Error**: `Could not find the table 'public.xyz' in the schema cache`

**Solution**: The table doesn't exist. Check available tables with:
```bash
npx tsx scripts/verify-supabase-connection.ts
```

### Column Not Found

**Error**: `column xyz.abc does not exist`

**Solution**: Query the table with `select('*')` first to see available columns:
```typescript
const { data } = await client.from('xyz').select('*').limit(1);
console.log(data);
```

### Permission Denied

**Error**: `permission denied for table xyz`

**Solution**:
- Verify service role key is correctly set
- Check that RLS policies allow service role access
- Run verification script to test connection

## Running Tests

```bash
# Run all tests
npm run test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Security Notes

⚠️ **IMPORTANT**: The service role key bypasses ALL Row Level Security (RLS) policies!

- Never commit the service role key to version control (it's in `.env`)
- Never expose the service role key in client-side code
- Only use it in backend code and tests
- Be careful when running tests against production database
- Always clean up test data to avoid pollution

## Additional Resources

- [Supabase JavaScript Client Documentation](https://supabase.com/docs/reference/javascript)
- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Documentation](https://testing-library.com/)
