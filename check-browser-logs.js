/**
 * Check browser console and network logs for BUG-022
 * Connects to existing Playwright browser instance
 */

import { chromium } from 'playwright';

async function checkLogs() {
  console.log('=== CHECKING BROWSER LOGS ===\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console messages
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text, time: new Date().toISOString() });
    console.log(`[${msg.type().toUpperCase()}] ${text}`);
  });

  // Capture page errors
  page.on('pageerror', error => {
    console.log(`[PAGE ERROR] ${error.message}`);
  });

  // Track network requests to file endpoints
  page.on('request', req => {
    if (req.url().includes('/api/files')) {
      console.log(`[REQUEST] ${req.method()} ${req.url()}`);
    }
  });

  page.on('response', async res => {
    if (res.url().includes('/api/files')) {
      console.log(`[RESPONSE] ${res.status()} ${res.url()}`);

      // Log response body for debugging
      if (res.url().includes('/api/files/upload')) {
        try {
          const body = await res.text();
          console.log(`[UPLOAD RESPONSE BODY] ${body.substring(0, 500)}`);
        } catch (e) {
          console.log(`[Could not read upload response body]`);
        }
      }
    }
  });

  console.log('\n1. Navigating to http://localhost:5173...\n');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  console.log('\n2. Page loaded. Checking for existing files...\n');

  // Wait for file button to appear
  await page.waitForTimeout(2000);

  // Check if files button exists
  const hasFilesButton = await page.locator('button.file-list-btn').count() > 0;
  console.log(`Files button visible: ${hasFilesButton ? 'YES' : 'NO'}`);

  if (hasFilesButton) {
    const badgeText = await page.locator('button.file-list-btn .file-count').textContent();
    console.log(`File count badge: ${badgeText}`);

    console.log('\n3. Clicking files button to open dropdown...\n');
    await page.click('button.file-list-btn');
    await page.waitForTimeout(1000);

    const fileItems = await page.locator('.file-item').count();
    console.log(`Files in dropdown: ${fileItems}\n`);

    for (let i = 0; i < fileItems; i++) {
      const item = page.locator('.file-item').nth(i);
      const name = await item.locator('.file-name').textContent();
      const statusEl = item.locator('.file-status');
      const status = await statusEl.count() > 0 ? await statusEl.textContent() : 'N/A';

      console.log(`File ${i + 1}:`);
      console.log(`  Name: ${name}`);
      console.log(`  Status: ${status}`);

      // Try to get progress
      const progressEl = item.locator('.file-progress');
      if (await progressEl.count() > 0) {
        const progress = await progressEl.textContent();
        console.log(`  Progress: ${progress}`);
      }
    }
  }

  console.log('\n4. Checking for EventSource (SSE) connection...\n');

  const sseCheck = await page.evaluate(() => {
    const resources = window.performance.getEntriesByType('resource');
    const sseResources = resources.filter(r => r.name.includes('/api/files/events'));
    return {
      found: sseResources.length > 0,
      connections: sseResources.map(r => ({
        name: r.name,
        duration: r.duration,
        transferSize: r.transferSize
      }))
    };
  });

  if (sseCheck.found) {
    console.log(`✅ SSE connections found: ${sseCheck.connections.length}`);
    sseCheck.connections.forEach((conn, i) => {
      console.log(`  Connection ${i + 1}: ${conn.name}`);
      console.log(`    Duration: ${conn.duration}ms`);
      console.log(`    Transfer size: ${conn.transferSize} bytes`);
    });
  } else {
    console.log('❌ NO SSE connections found in performance entries');
  }

  console.log('\n5. Checking console logs for Files Store messages...\n');

  const filesStoreLogs = consoleLogs.filter(log => log.text.includes('[Files Store]'));
  if (filesStoreLogs.length > 0) {
    console.log(`Found ${filesStoreLogs.length} Files Store log messages:`);
    filesStoreLogs.forEach(log => {
      console.log(`  [${log.type}] ${log.text}`);
    });
  } else {
    console.log('❌ No Files Store log messages found');
  }

  console.log('\n=== DIAGNOSIS COMPLETE ===');
  console.log('\nSummary:');
  console.log(`- Total console messages: ${consoleLogs.length}`);
  console.log(`- Files Store messages: ${filesStoreLogs.length}`);
  console.log(`- SSE connections: ${sseCheck.connections.length}`);
  console.log(`- Files visible in UI: ${hasFilesButton ? 'YES' : 'NO'}`);

  console.log('\nBrowser will remain open for inspection. Press Ctrl+C when done.\n');

  // Keep browser open
  await new Promise(() => {});
}

checkLogs().catch(console.error);
