/**
 * Playwright Capability
 *
 * Direct Playwright integration for web automation.
 * Returns only script results - no MCP page snapshot overhead.
 *
 * Token savings: ~4000-5000 tokens per call vs Playwright MCP.
 *
 * @example
 * import { executeScript, closeBrowser } from '$lib/capabilities/playwright';
 *
 * const result = await executeScript(
 *   'https://example.com/page',
 *   `() => {
 *     return document.querySelectorAll('h3').length;
 *   }`
 * );
 *
 * if (result.success) {
 *   console.log(result.data); // Just the number, no DOM dump
 * }
 */

// Session management
export {
	ensureBrowser,
	closeBrowser,
	isBrowserRunning,
	getCurrentUrl
} from './session';

// Script execution
export {
	executeScript,
	executeFunction,
	navigateTo,
	clickElement,
	type ExecuteOptions,
	type ExecuteResult
} from './executor';
