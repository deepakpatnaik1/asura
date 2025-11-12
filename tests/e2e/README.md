# End-to-End Tests - File Upload Feature

## Overview

This directory contains Playwright E2E tests for the file upload feature. Tests cover complete user workflows from UI interaction to backend integration.

## Test Files

- **`file-upload.spec.ts`** (15 tests) - Upload flows, progress tracking, drag & drop
- **`file-management.spec.ts`** (14 tests) - File list, deletion, empty states
- **`error-scenarios.spec.ts`** (13 tests) - Validation, error handling, recovery

**Total**: 42 E2E tests

## Prerequisites

1. **Node.js 20+** (for dev server)
2. **Chromium browser** installed
3. **Dev server running** on `http://localhost:5173`

## Setup

### 1. Install Playwright Browser

```bash
npx playwright install chromium
```

### 2. Start Dev Server

**Terminal 1:**
```bash
npm run dev
```

Wait for server to start at `http://localhost:5173`

## Running Tests

### All E2E Tests

**Terminal 2:**
```bash
npm run test:e2e
```

### Specific Test File

```bash
npm run test:e2e tests/e2e/file-upload.spec.ts
```

### UI Mode (Interactive)

```bash
npm run test:e2e:ui
```

This opens Playwright's test UI where you can:
- See tests as they run
- Inspect DOM at each step
- Debug failures visually
- Re-run individual tests

### Headed Mode (See Browser)

```bash
npx playwright test --headed
```

## Test Structure

Each test follows this pattern:

```typescript
test('uploads file via file picker successfully', async ({ page }) => {
  // Navigate to app
  await page.goto('/');

  // Perform actions
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('test-files/test.txt');

  // Verify results
  await expect(page.locator('.file-list-container')).toBeVisible();
  await expect(page.locator('.file-item-name').filter({ hasText: 'test.txt' })).toBeVisible();
});
```

## Important Notes

### Current Limitations

1. **Backend Processing**: Files remain in "processing" state (no auth/LLM APIs)
   - Tests verify UI structure and client-side behavior
   - TODOs mark tests that require backend completion

2. **No Test Cleanup**: Uploaded files persist in database
   - Requires manual cleanup or database reset
   - Future: Add cleanup hooks when auth is implemented

3. **Manual Dev Server**: Cannot auto-start due to Node version
   - Must start dev server manually before running tests
   - Playwright config has webServer commented out

### TODOs in Tests

Tests include `TODO` comments for features requiring backend:

```typescript
// TODO: Wait for file to transition to ready status
// This requires backend processing to complete

// Post-auth TODO: Test full deletion flow
```

These will become testable once:
- Auth is implemented (`userId` not null)
- LLM APIs are configured
- File processing completes successfully

## Test Data

Test files located in `/test-files/`:
- `test.txt` - Plain text file
- `test.md` - Markdown file
- `test.js` - JavaScript code
- `test.ts` - TypeScript code
- `test.csv` - CSV spreadsheet
- `test-empty.txt` - Empty file (for error testing)
- `test.pdf` - PDF document
- `test.png` - Image file

## Debugging Failed Tests

### Common Issues

**"Dev server not running"**
```bash
# Check if server is accessible
curl http://localhost:5173

# If not, start dev server in another terminal
npm run dev
```

**"Element not found"**
- CSS class may have changed in UI
- Check `src/routes/+page.svelte` for current class names
- Update test locators to match

**"Timeout waiting for element"**
- Increase timeout: `await expect(...).toBeVisible({ timeout: 10000 })`
- Check network tab in browser DevTools
- Verify backend is responding

### Debug Tools

**1. Trace Viewer**
```bash
# Tests automatically save traces on failure
npx playwright show-trace test-results/[test-name]/trace.zip
```

**2. Screenshots**
```bash
# Check test-results/ directory for failure screenshots
open test-results/[test-name]/test-failed-1.png
```

**3. Console Logs**
```typescript
// Add console logging in tests
page.on('console', msg => console.log(msg.text()));
```

**4. Pause on Failure**
```typescript
// Add this to pause execution at specific point
await page.pause();
```

## Writing New Tests

### Template

```typescript
test('new test description', async ({ page }) => {
  // 1. Navigate to app
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();

  // 2. Perform actions
  // ... user interactions ...

  // 3. Verify outcomes
  // ... assertions ...
});
```

### Best Practices

1. **Use data-testid for stable selectors**
   ```typescript
   // Instead of: page.locator('.file-item-name')
   // Better: page.locator('[data-testid="file-item-name"]')
   ```

2. **Wait for specific conditions**
   ```typescript
   // Good: Wait for specific element
   await expect(page.locator('.file-list')).toBeVisible();

   // Avoid: Generic timeouts
   await page.waitForTimeout(5000);
   ```

3. **Use descriptive assertions**
   ```typescript
   // Good: Specific expectation
   await expect(page.locator('.file-count')).toHaveText('3');

   // Avoid: Generic checks
   await expect(page.locator('.file-count')).toBeVisible();
   ```

4. **Clean up in afterEach**
   ```typescript
   test.afterEach(async ({ page }) => {
     // TODO: Add cleanup when auth is implemented
     // await deleteAllTestFiles();
   });
   ```

## Configuration

See `playwright.config.ts` for:
- Test directory: `./tests/e2e`
- Browser: Chromium
- Base URL: `http://localhost:5173`
- Timeouts, retries, screenshots, video

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install chromium
      - run: npm run dev &
      - run: npx wait-on http://localhost:5173
      - run: npm run test:e2e
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Test Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Guide](https://playwright.dev/docs/debug)
- [Trace Viewer](https://playwright.dev/docs/trace-viewer)

## Questions?

See `/working/file-uploads/t5-e2e-test-report.md` for detailed implementation report.
