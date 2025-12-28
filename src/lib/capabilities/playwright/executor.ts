/**
 * Playwright Script Executor
 *
 * Executes scripts in the browser and returns ONLY the result.
 * No page snapshots, no DOM dumps - just the extracted data.
 */

import { ensureBrowser, saveCookies } from './session';

export interface ExecuteOptions {
	/** Wait time in ms after navigation (default: 2000) */
	waitMs?: number;
	/** Skip navigation, run on current page */
	skipNavigation?: boolean;
}

export interface ExecuteResult<T> {
	success: boolean;
	data?: T;
	error?: string;
	url?: string;
}

/**
 * Execute a script on a page and return only the result.
 *
 * @param url - URL to navigate to (ignored if skipNavigation is true)
 * @param script - JavaScript function string to evaluate in browser context
 * @param options - Execution options
 * @returns Only the script result - no page snapshots
 *
 * @example
 * const result = await executeScript(
 *   'https://example.com/page',
 *   `() => {
 *     const items = [];
 *     document.querySelectorAll('h3').forEach(h => {
 *       items.push({ title: h.textContent });
 *     });
 *     return items;
 *   }`,
 *   { waitMs: 3000 }
 * );
 */
export async function executeScript<T>(
	url: string,
	script: string,
	options: ExecuteOptions = {}
): Promise<ExecuteResult<T>> {
	const { waitMs = 2000, skipNavigation = false } = options;

	try {
		const page = await ensureBrowser();

		// Navigate if needed
		if (!skipNavigation) {
			await page.goto(url, { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(waitMs);
		}

		// Execute the script
		// The script should be a function that returns data
		const data = await page.evaluate(script);

		// Save cookies after successful operation
		await saveCookies();

		return {
			success: true,
			data: data as T,
			url: page.url()
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Execute a script that's already a function (not a string).
 * Useful for TypeScript type safety.
 */
export async function executeFunction<T>(
	url: string,
	fn: () => T,
	options: ExecuteOptions = {}
): Promise<ExecuteResult<T>> {
	return executeScript<T>(url, `(${fn.toString()})()`, options);
}

/**
 * Navigate to a URL without extracting anything.
 * Useful for setup steps.
 */
export async function navigateTo(
	url: string,
	options: { waitMs?: number } = {}
): Promise<ExecuteResult<null>> {
	const { waitMs = 2000 } = options;

	try {
		const page = await ensureBrowser();
		await page.goto(url, { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(waitMs);
		await saveCookies();

		return {
			success: true,
			data: null,
			url: page.url()
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Click an element and optionally wait.
 */
export async function clickElement(
	selector: string,
	options: { waitMs?: number } = {}
): Promise<ExecuteResult<null>> {
	const { waitMs = 1000 } = options;

	try {
		const page = await ensureBrowser();
		await page.click(selector);
		await page.waitForTimeout(waitMs);

		return {
			success: true,
			data: null,
			url: page.url()
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}
