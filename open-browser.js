/**
 * Open app in Playwright browser for manual testing
 */

import { chromium } from 'playwright';

async function openApp() {
  console.log('[Browser] Launching Playwright browser...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 100  // Slow down actions for visibility
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console messages
  page.on('console', msg => {
    const type = msg.type();
    const prefix = type === 'error' ? '❌' :
                   type === 'warning' ? '⚠️' :
                   type === 'log' ? '📝' : '💬';
    console.log(`${prefix} [${type.toUpperCase()}] ${msg.text()}`);
  });

  // Capture page errors
  page.on('pageerror', err => {
    console.error('💥 [PAGE ERROR]', err.message);
  });

  // Capture network failures
  page.on('requestfailed', request => {
    console.error(`🌐 [NETWORK FAIL] ${request.failure()?.errorText} - ${request.url()}`);
  });

  console.log('[Browser] Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  console.log('[Browser] ✓ App loaded successfully');
  console.log('[Browser] Browser will remain open. Press Ctrl+C to close.');
  console.log('[Browser] You can now upload files and test the progress bar.\n');

  // Keep browser open indefinitely
  await new Promise(() => {}); // Never resolves
}

openApp().catch(console.error);
