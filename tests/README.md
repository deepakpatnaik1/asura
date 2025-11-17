# Asura Test Infrastructure

This directory contains the automated test suite for the Asura project.

## Directory Structure

```
tests/
├── unit/                  # Unit tests for individual functions/modules
├── integration/           # Integration tests for multiple components
├── e2e/                   # End-to-end tests (Playwright)
├── fixtures/              # Test data and fixtures
│   ├── files.fixture.ts   # File-related test data
│   └── context.fixture.ts # Context/decision arc test data
├── mocks/                 # Mock factories for dependencies
│   ├── supabase.mock.ts   # Supabase client mocks
│   ├── voyage.mock.ts     # Voyage AI client mocks
│   └── fireworks.mock.ts  # Fireworks AI client mocks
├── helpers/               # Test utility functions
│   └── test-utils.ts      # Common test helpers
├── setup.ts               # Global test setup
└── README.md              # This file
```

## Getting Started

### Prerequisites

- Node.js 22+ (use nvm to switch: `nvm use 22`)
- npm 10+

### Installing Dependencies

All test dependencies are already installed as dev dependencies:

```bash
npm install
```

### Running Tests

```bash
# Run all tests once
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with UI (interactive test viewer)
npm run test:ui

# Run tests with coverage report
npm run test:coverage

# Run E2E tests (Playwright)
npm run test:e2e

# Run all tests (unit + integration + e2e)
npm run test:all
```

## Writing Tests

### Test File Naming

- Unit tests: `*.test.ts` or `*.spec.ts` in `tests/unit/`
- Integration tests: `*.test.ts` or `*.spec.ts` in `tests/integration/`
- Place test files in directories mirroring the source structure

Example:
```
src/lib/vectorization.ts  →  tests/unit/lib/vectorization.test.ts
```

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('MyModule', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  it('should do something', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = myFunction(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

### Using Test Fixtures

```typescript
import { createMockTextFile, sampleFileMetadata } from '../fixtures';

it('should process a file', () => {
  const file = createMockTextFile('test.txt', 'content');
  // Use the file in your test
});
```

### Using Mock Factories

```typescript
import { createMockSupabaseClient, createMockVoyageClient } from '../mocks';

it('should call Supabase', async () => {
  const mockSupabase = createMockSupabaseClient();
  // Use mockSupabase in your test
});
```

### Using Test Helpers

```typescript
import { wait, waitFor, captureConsole } from '../helpers';

it('should log output', async () => {
  const console = captureConsole();

  myFunction(); // logs something

  expect(console.logs).toContain('expected log');
  console.restore();
});
```

## Environment Variables

Test environment variables are automatically set in `tests/setup.ts`:

- `PUBLIC_SUPABASE_URL`: Mock Supabase URL
- `PUBLIC_SUPABASE_ANON_KEY`: Mock Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY`: Mock service role key
- `FIREWORKS_API_KEY`: Mock Fireworks API key
- `VOYAGE_API_KEY`: Mock Voyage API key

If you need real API keys for integration tests, create a `.env.test` file:

```bash
# .env.test
PUBLIC_SUPABASE_URL=your_real_url
PUBLIC_SUPABASE_ANON_KEY=your_real_key
# etc.
```

## Coverage Reports

Coverage reports are generated in the `coverage/` directory:

- `coverage/index.html` - Interactive HTML report
- `coverage/lcov.info` - LCOV format for CI tools
- `coverage/coverage-final.json` - JSON format

Coverage thresholds are set to 80% for:
- Lines
- Functions
- Branches
- Statements

## Best Practices

### 1. Test Isolation
- Each test should be independent
- Use `beforeEach` to set up fresh state
- Don't rely on test execution order

### 2. Mock External Dependencies
- Always mock API calls (Supabase, Voyage AI, Fireworks AI)
- Use the provided mock factories
- Don't make real API calls in unit tests

### 3. Descriptive Test Names
```typescript
// Good
it('should throw VectorizationError when text is empty', () => {})

// Bad
it('test vectorization', () => {})
```

### 4. Arrange-Act-Assert Pattern
```typescript
it('should calculate sum', () => {
  // Arrange
  const a = 2;
  const b = 3;

  // Act
  const result = add(a, b);

  // Assert
  expect(result).toBe(5);
});
```

### 5. Test Edge Cases
- Empty inputs
- Null/undefined values
- Very large inputs
- Concurrent operations
- Error conditions

### 6. Async Testing
```typescript
// Use async/await
it('should fetch data', async () => {
  const data = await fetchData();
  expect(data).toBeDefined();
});

// Test rejections
it('should handle errors', async () => {
  await expect(failingFunction()).rejects.toThrow('error message');
});
```

## Troubleshooting

### Tests Failing Due to Node Version
Make sure you're using Node 22+:
```bash
nvm use 22
npm test
```

### Module Resolution Issues
If tests can't find modules, check:
1. `vitest.config.ts` has correct path aliases
2. `tsconfig.json` is properly configured
3. Run `npm run prepare` to sync SvelteKit

### Timeout Errors
Increase timeout in individual tests:
```typescript
it('slow test', async () => {
  // test code
}, 30000); // 30 second timeout
```

Or globally in `vitest.config.ts`:
```typescript
test: {
  testTimeout: 30000
}
```

## Next Steps

Now that the test infrastructure is ready, you can:

1. Start with T1: Unit Tests
2. Write tests for core modules (vectorization, file processing, etc.)
3. Add integration tests (T2-T4)
4. Add E2E tests with Playwright (T5-T6)

Happy testing!
