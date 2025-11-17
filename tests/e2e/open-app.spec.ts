import { test, expect } from 'playwright/test';

test('Open Asura app', async ({ page }) => {
  // Navigate to the app
  await page.goto('/');

  // Wait for the page to load
  await page.waitForLoadState('networkidle');

  // Take a screenshot
  await page.screenshot({ path: 'asura-homepage.png', fullPage: true });

  // Keep the browser open for manual inspection
  await page.pause();
});
