/**
 * Check Browser Console Logs for BUG-022 Investigation
 * Opens the app in Playwright and monitors console for errors
 */

import { chromium } from 'playwright';

async function checkLogs() {
  console.log('=== BROWSER CONSOLE LOG CHECKER ===\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture all console messages
  const logs = [];
  page.on('console', msg => {
    const logEntry = {
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString()
    };
    logs.push(logEntry);

    // Color code based on type
    const prefix = msg.type() === 'error' ? '❌' :
                   msg.type() === 'warning' ? '⚠️' :
                   msg.type() === 'log' ? '📝' :
                   msg.type() === 'debug' ? '🐛' : '💬';

    console.log(`${prefix} [${msg.type().toUpperCase()}] ${msg.text()}`);
  });

  // Capture page errors
  page.on('pageerror', err => {
    console.error('💥 [PAGE ERROR]', err.message);
    console.error(err.stack);
  });

  // Capture network failures
  page.on('requestfailed', request => {
    console.error(`🌐 [NETWORK FAIL] ${request.failure()?.errorText} - ${request.url()}`);
  });

  try {
    console.log('[Checker] Navigating to http://localhost:5174...\n');
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });

    console.log('\n[Checker] Page loaded. Waiting 5 seconds to observe initial state...\n');
    await page.waitForTimeout(5000);

    console.log('\n[Checker] Checking if SSE connection was established...');
    const sseConnected = logs.some(log =>
      log.text.includes('SSE connected') ||
      log.text.includes('Connecting to SSE')
    );

    if (sseConnected) {
      console.log('✅ SSE connection attempt detected');
    } else {
      console.log('❌ No SSE connection attempt detected');
    }

    console.log('\n[Checker] Checking for errors...');
    const errors = logs.filter(log => log.type === 'error');

    if (errors.length > 0) {
      console.log(`\n❌ Found ${errors.length} error(s):`);
      errors.forEach((err, idx) => {
        console.log(`\n  Error ${idx + 1}:`);
        console.log(`    ${err.text}`);
      });
    } else {
      console.log('✅ No errors detected');
    }

    console.log('\n[Checker] Browser will remain open for 30 seconds for manual inspection...');
    console.log('[Checker] You can now upload a file and watch the console in real-time.\n');

    await page.waitForTimeout(30000);

    console.log('\n[Checker] Closing browser...');

  } catch (error) {
    console.error('[Checker Error]', error.message);
  } finally {
    await browser.close();
    console.log('[Checker] Done.');
  }
}

checkLogs().catch(console.error);
