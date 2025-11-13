/**
 * UI Diagnosis Script for BUG-022 Investigation
 * Tests file upload progress bar issue
 */

import { chromium } from 'playwright';

async function diagnoseBug() {
  console.log('=== BUG-022 UI DIAGNOSIS ===\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString()
    });
  });

  // Collect network requests
  const networkRequests = [];
  page.on('request', request => {
    if (request.url().includes('/api/files')) {
      networkRequests.push({
        method: request.method(),
        url: request.url(),
        timestamp: new Date().toISOString()
      });
    }
  });

  // Collect network responses
  const networkResponses = [];
  page.on('response', response => {
    if (response.url().includes('/api/files')) {
      networkResponses.push({
        status: response.status(),
        url: response.url(),
        timestamp: new Date().toISOString()
      });
    }
  });

  console.log('1. Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForLoadState('networkidle');

  console.log('2. Page loaded. Waiting 2 seconds for initial SSE connection...');
  await page.waitForTimeout(2000);

  console.log('\n=== INITIAL STATE ===');
  console.log('Console messages:', consoleMessages.length);
  consoleMessages.forEach(msg => {
    console.log(`  [${msg.type}] ${msg.text}`);
  });

  console.log('\nNetwork requests to /api/files:', networkRequests.length);
  networkRequests.forEach(req => {
    console.log(`  ${req.method} ${req.url}`);
  });

  console.log('\nNetwork responses from /api/files:', networkResponses.length);
  networkResponses.forEach(res => {
    console.log(`  ${res.status} ${res.url}`);
  });

  // Check for EventSource connection
  console.log('\n=== SSE CONNECTION CHECK ===');
  const sseConnection = await page.evaluate(() => {
    const connections = window.performance.getEntriesByType('resource')
      .filter(e => e.name.includes('/api/files/events'));
    return connections.length > 0 ? connections : null;
  });

  if (sseConnection) {
    console.log('✅ SSE connection found:', sseConnection.length, 'connections');
    sseConnection.forEach(conn => {
      console.log(`  ${conn.name}`);
    });
  } else {
    console.log('❌ NO SSE connection found');
  }

  // Check filesStore state
  console.log('\n=== FILES STORE STATE ===');
  const filesStoreState = await page.evaluate(() => {
    // Try to access the store (may not be exposed globally)
    return {
      message: 'Store not accessible from window (expected for Svelte stores)',
      hint: 'Need to check store state via component inspection or debugging'
    };
  });
  console.log(filesStoreState);

  // Check for files in dropdown
  console.log('\n=== UI ELEMENTS CHECK ===');
  const fileListButton = await page.locator('button.file-list-btn').count();
  console.log('File list button visible:', fileListButton > 0 ? '✅ YES' : '❌ NO');

  if (fileListButton > 0) {
    const badge = await page.locator('button.file-list-btn .file-count').textContent();
    console.log('File count badge:', badge);

    // Click to open dropdown
    await page.locator('button.file-list-btn').click();
    await page.waitForTimeout(500);

    const files = await page.locator('.file-item').count();
    console.log('Files in dropdown:', files);

    if (files > 0) {
      for (let i = 0; i < files; i++) {
        const filename = await page.locator('.file-item').nth(i).locator('.file-name').textContent();
        const status = await page.locator('.file-item').nth(i).locator('.file-status').textContent();
        const progress = await page.locator('.file-item').nth(i).locator('.file-progress').textContent();

        console.log(`  File ${i + 1}: ${filename}`);
        console.log(`    Status: ${status}`);
        console.log(`    Progress: ${progress}`);
      }
    }
  }

  // Wait a bit to see if progress updates
  console.log('\n=== WAITING 10 SECONDS FOR PROGRESS UPDATES ===');
  await page.waitForTimeout(10000);

  console.log('\nNew console messages:', consoleMessages.filter((_, i) => i >= consoleMessages.length - 10));

  console.log('\n=== DIAGNOSIS COMPLETE ===');
  console.log('Browser will remain open for manual inspection.');
  console.log('Press Ctrl+C to close when done.\n');

  // Keep browser open for manual inspection
  await new Promise(() => {});
}

diagnoseBug().catch(console.error);
