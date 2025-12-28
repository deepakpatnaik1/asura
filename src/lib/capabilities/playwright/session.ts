/**
 * Playwright Browser Session Management
 *
 * Manages a persistent browser session for web automation.
 * Uses launchPersistentContext for full session persistence (cookies, localStorage, IndexedDB).
 * Log in once, stays logged in forever.
 */

import { chromium, type BrowserContext, type Page } from 'playwright';

// Singleton instances
let context: BrowserContext | null = null;
let page: Page | null = null;

// User data directory for persistent browser profile
const USER_DATA_DIR = '/tmp/aether-playwright-session';

/**
 * Ensure browser is running and return the page.
 * Launches browser if not already running.
 */
export async function ensureBrowser(): Promise<Page> {
	if (context && page && !page.isClosed()) {
		return page;
	}

	// Close existing if in bad state
	await closeBrowser();

	// Launch with persistent context - preserves full browser state
	// including cookies, localStorage, IndexedDB, service workers
	context = await chromium.launchPersistentContext(USER_DATA_DIR, {
		headless: false, // Boss needs to see for manual posting
		args: ['--disable-blink-features=AutomationControlled'],
		userAgent:
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		viewport: { width: 1280, height: 800 }
	});

	// Get existing page or create new one
	const pages = context.pages();
	page = pages.length > 0 ? pages[0] : await context.newPage();

	return page;
}

/**
 * Close browser and cleanup.
 * Session data persists in USER_DATA_DIR automatically.
 */
export async function closeBrowser(): Promise<void> {
	if (page && !page.isClosed()) {
		await page.close().catch(() => {});
	}
	if (context) {
		await context.close().catch(() => {});
	}

	page = null;
	context = null;
}

/**
 * Check if browser is currently running.
 */
export function isBrowserRunning(): boolean {
	return context !== null && page !== null && !page.isClosed();
}

/**
 * Get the current page URL, or null if no page.
 */
export async function getCurrentUrl(): Promise<string | null> {
	if (!page || page.isClosed()) return null;
	return page.url();
}

// saveCookies is no longer needed - persistent context handles this automatically
// Keeping export for backwards compatibility but it's a no-op
export async function saveCookies(): Promise<void> {
	// No-op: launchPersistentContext handles persistence automatically
}
