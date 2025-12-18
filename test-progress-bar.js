/**
 * Test BUG-022 Fix: Progress Bar Updates
 *
 * This test uploads a file and verifies the progress bar updates correctly
 * through the SSE connection (0% → 25% → 75% → 90% → 100%)
 */

import { chromium } from 'playwright';

async function testProgressBar() {
  console.log('[Test] Starting BUG-022 progress bar test...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
  });

  // Track page errors
  page.on('pageerror', err => {
    console.error(`[Browser Error] ${err.message}`);
  });

  try {
    console.log('[Test] Navigating to http://localhost:5174...');
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('[Test] Looking for file upload button...');

    // Find the file input
    const fileInput = await page.locator('input[type="file"]').first();
    if (!fileInput) {
      throw new Error('File input not found');
    }

    console.log('[Test] Found file input, uploading gettysburg.txt...');

    // Track progress updates
    const progressUpdates = [];

    // Listen for SSE events by monitoring the progress bar
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[SSE]') || text.includes('progress')) {
        console.log(`[SSE Event] ${text}`);
      }
    });

    // Upload the file
    await fileInput.setInputFiles('/Users/d.patnaik/obsidian/aether-code/test-files/gettysburg.txt');

    console.log('[Test] File selected, waiting for upload to start...');
    await page.waitForTimeout(1000);

    // Check for progress bar every 500ms for 30 seconds
    console.log('[Test] Monitoring progress bar updates...\n');
    const startTime = Date.now();
    const timeout = 30000;
    let lastProgress = -1;

    while (Date.now() - startTime < timeout) {
      // Look for progress bar or progress text
      const progressElements = await page.locator('[data-testid="file-progress"], .progress-bar, [role="progressbar"]').all();

      for (const elem of progressElements) {
        const text = await elem.textContent();
        const ariaValue = await elem.getAttribute('aria-valuenow');

        if (text && text.includes('%')) {
          const match = text.match(/(\d+)%/);
          if (match) {
            const progress = parseInt(match[1]);
            if (progress !== lastProgress) {
              console.log(`[Progress Update] ${progress}%`);
              progressUpdates.push(progress);
              lastProgress = progress;
            }
          }
        }

        if (ariaValue) {
          const progress = parseInt(ariaValue);
          if (progress !== lastProgress) {
            console.log(`[Progress Update] ${progress}%`);
            progressUpdates.push(progress);
            lastProgress = progress;
          }
        }
      }

      // Check if we reached 100%
      if (lastProgress === 100) {
        console.log('\n[Test] ✓ Upload complete! Progress reached 100%');
        break;
      }

      await page.waitForTimeout(500);
    }

    console.log('\n[Test Results]');
    console.log('===============');
    console.log(`Progress updates observed: ${progressUpdates.length}`);
    console.log(`Progress values: [${progressUpdates.join(', ')}]`);

    // Verify we got progress updates
    if (progressUpdates.length === 0) {
      console.error('\n[FAIL] ❌ No progress updates observed! Progress bar stuck at 0%');
      console.error('BUG-022 fix did NOT work');
    } else if (progressUpdates.length === 1 && progressUpdates[0] === 0) {
      console.error('\n[FAIL] ❌ Progress bar stuck at 0%');
      console.error('BUG-022 fix did NOT work');
    } else if (lastProgress === 100) {
      console.log('\n[PASS] ✓ Progress bar updated correctly!');
      console.log('BUG-022 fix WORKS!');
    } else {
      console.warn('\n[PARTIAL] ⚠ Progress updates observed but did not reach 100%');
      console.warn(`Last progress: ${lastProgress}%`);
    }

    // Keep browser open for inspection
    console.log('\n[Test] Keeping browser open for 10 seconds for inspection...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error(`[Test Error] ${error.message}`);
    console.error(error.stack);
  } finally {
    await browser.close();
    console.log('[Test] Browser closed');
  }
}

testProgressBar().catch(console.error);
