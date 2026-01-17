/**
 * Browser Tools for Felix
 *
 * Playwright-powered browser automation for financial admin tasks.
 * Felix can navigate portals, extract invoice details, and automate workflows.
 *
 * Browser session persists across tool calls within a conversation.
 * 1Password integration for secure credential retrieval.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import { exec } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { join } from 'path';

// Downloads go to ~/Downloads (standard macOS location)
const DOWNLOADS_PATH = join(homedir(), 'Downloads');

const execAsync = promisify(exec);

/**
 * 1Password credential retrieval
 * Credentials are NEVER returned to Felix - only used internally by browser tools
 */
interface Credential {
	username: string;
	password: string;
}

async function getCredentialFrom1Password(itemName: string): Promise<Credential | null> {
	try {
		// Try to get credentials from 1Password CLI
		const { stdout } = await execAsync(
			`op item get "${itemName}" --fields username,password --format json`,
			{ timeout: 10000 }
		);

		const fields = JSON.parse(stdout);
		const username = fields.find((f: any) => f.id === 'username')?.value;
		const password = fields.find((f: any) => f.id === 'password')?.value;

		if (username && password) {
			return { username, password };
		}
		return null;
	} catch (error) {
		// Session expired or item not found
		console.error('1Password error:', error instanceof Error ? error.message : 'Unknown error');
		return null;
	}
}

/**
 * Tool Definitions
 */

export const BROWSE_URL_TOOL: Anthropic.Tool = {
	name: 'browse_url',
	description:
		'Navigate to a URL and get a snapshot of the page. Use this to open portals, check invoices, or navigate to links from emails. Returns an accessibility tree showing all interactive elements with ref IDs for clicking.',
	input_schema: {
		type: 'object',
		properties: {
			url: {
				type: 'string',
				description: 'The URL to navigate to'
			}
		},
		required: ['url']
	}
};

export const BROWSER_CLICK_TOOL: Anthropic.Tool = {
	name: 'browser_click',
	description:
		'Click on an element in the current page. Use the ref ID from the page snapshot to identify the element. Returns updated page snapshot after click.',
	input_schema: {
		type: 'object',
		properties: {
			ref: {
				type: 'string',
				description: 'The ref ID of the element to click (from page snapshot)'
			},
			element: {
				type: 'string',
				description: 'Human-readable description of what you\'re clicking (e.g., "Login button", "View Invoice link")'
			}
		},
		required: ['ref', 'element']
	}
};

export const BROWSER_TYPE_TOOL: Anthropic.Tool = {
	name: 'browser_type',
	description:
		'Type text into a form field. First click on the field using browser_click, then use this to enter text. Use submit: true to press Enter after typing (for search boxes, login forms).',
	input_schema: {
		type: 'object',
		properties: {
			ref: {
				type: 'string',
				description: 'The ref ID of the input field (from page snapshot)'
			},
			text: {
				type: 'string',
				description: 'The text to type'
			},
			submit: {
				type: 'boolean',
				description: 'Press Enter after typing (default: false)'
			}
		},
		required: ['ref', 'text']
	}
};

export const BROWSER_SNAPSHOT_TOOL: Anthropic.Tool = {
	name: 'browser_snapshot',
	description:
		'Get a snapshot of the current page state. Returns accessibility tree with all interactive elements. Use this after waiting for page loads or to check current state.',
	input_schema: {
		type: 'object',
		properties: {},
		required: []
	}
};

export const BROWSER_CLOSE_TOOL: Anthropic.Tool = {
	name: 'browser_close',
	description: 'Close the browser session. Use when done with a browsing task.',
	input_schema: {
		type: 'object',
		properties: {},
		required: []
	}
};

export const BROWSER_LOGIN_TOOL: Anthropic.Tool = {
	name: 'browser_login',
	description:
		'Log into a website using credentials from 1Password. Credentials are retrieved securely and never shown in conversation. Use when you need to authenticate to a portal (Check24, TK, Helvetia, Fyrst, N26, etc.).',
	input_schema: {
		type: 'object',
		properties: {
			item_name: {
				type: 'string',
				description: 'Name of the item in 1Password (e.g., "Check24", "TK Postbox", "Fyrst Bank")'
			},
			username_ref: {
				type: 'string',
				description: 'The ref ID of the username/email input field (from page snapshot)'
			},
			password_ref: {
				type: 'string',
				description: 'The ref ID of the password input field (from page snapshot)'
			},
			submit_ref: {
				type: 'string',
				description: 'Optional: The ref ID of the login/submit button. If not provided, will press Enter after password.'
			}
		},
		required: ['item_name', 'username_ref', 'password_ref']
	}
};

export const BROWSER_TOOLS: Anthropic.Tool[] = [
	BROWSE_URL_TOOL,
	BROWSER_CLICK_TOOL,
	BROWSER_TYPE_TOOL,
	BROWSER_SNAPSHOT_TOOL,
	BROWSER_CLOSE_TOOL,
	BROWSER_LOGIN_TOOL
];

/**
 * Check if a tool name is a browser tool
 */
export function isBrowserTool(toolName: string): boolean {
	return BROWSER_TOOLS.some((t) => t.name === toolName);
}

/**
 * Tool Execution Results
 */
export interface BrowserToolResult {
	success: boolean;
	message: string;
	data?: unknown;
}

/**
 * Browser Session Manager
 * Persists browser instance across tool calls
 */
class BrowserSession {
	private browser: Browser | null = null;
	private context: BrowserContext | null = null;
	private page: Page | null = null;
	private lastActivity: number = 0;
	private lastDownloadPath: string | null = null;
	private readonly TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

	async getPage(): Promise<Page> {
		// Check if session expired
		if (this.browser && Date.now() - this.lastActivity > this.TIMEOUT_MS) {
			await this.close();
		}

		if (!this.browser) {
			this.browser = await chromium.launch({
				headless: false, // Visible for debugging and manual intervention
				args: ['--disable-blink-features=AutomationControlled'],
				downloadsPath: DOWNLOADS_PATH
			});
			this.context = await this.browser.newContext({
				viewport: { width: 1280, height: 800 },
				userAgent:
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				acceptDownloads: true
			});
			this.page = await this.context.newPage();

			// Handle downloads - save to ~/Downloads with original filename
			this.page.on('download', async (download) => {
				const filename = download.suggestedFilename();
				const savePath = join(DOWNLOADS_PATH, filename);
				await download.saveAs(savePath);
				this.lastDownloadPath = savePath;
				console.log(`[Felix Browser] Downloaded: ${savePath}`);
			});
		}

		this.lastActivity = Date.now();
		return this.page!;
	}

	getLastDownload(): string | null {
		return this.lastDownloadPath;
	}

	async close(): Promise<void> {
		if (this.browser) {
			await this.browser.close();
			this.browser = null;
			this.context = null;
			this.page = null;
		}
	}

	isActive(): boolean {
		return this.browser !== null;
	}
}

// Global session instance (per-process)
const browserSession = new BrowserSession();

/**
 * Get page snapshot for Felix
 * Returns structured view of interactive elements
 */
async function getPageSnapshot(page: Page): Promise<string> {
	const url = page.url();
	const title = await page.title();

	// Extract interactive elements
	const elements: string[] = [];

	// Get all links
	const links = await page.locator('a[href]').all();
	for (const link of links.slice(0, 30)) {
		const text = await link.textContent();
		const href = await link.getAttribute('href');
		if (text?.trim()) {
			elements.push(`- link: "${text.trim().slice(0, 80)}" [ref="${text.trim().slice(0, 40)}"]`);
		}
	}

	// Get all buttons
	const buttons = await page.locator('button, input[type="button"], input[type="submit"]').all();
	for (const button of buttons.slice(0, 20)) {
		const text = await button.textContent() || await button.getAttribute('value') || await button.getAttribute('aria-label');
		if (text?.trim()) {
			elements.push(`- button: "${text.trim().slice(0, 80)}" [ref="${text.trim().slice(0, 40)}"]`);
		}
	}

	// Get all input fields
	const inputs = await page.locator('input[type="text"], input[type="email"], input[type="password"], input[type="search"], textarea').all();
	for (const input of inputs.slice(0, 15)) {
		const name = await input.getAttribute('name') || await input.getAttribute('placeholder') || await input.getAttribute('aria-label') || 'unnamed';
		const type = await input.getAttribute('type') || 'text';
		elements.push(`- input (${type}): "${name}" [ref="${name}"]`);
	}

	// Get main text content (truncated)
	const bodyText = await page.locator('body').textContent();
	const cleanText = bodyText?.replace(/\s+/g, ' ').trim().slice(0, 2000) || '';

	return `Page: ${url}
Title: ${title}

Interactive Elements:
${elements.join('\n') || '(none found)'}

Page Content Preview:
${cleanText}...`;
}

/**
 * Execute a browser tool
 */
export async function executeBrowserTool(
	toolName: string,
	input: Record<string, unknown>
): Promise<BrowserToolResult> {
	switch (toolName) {
		case 'browse_url':
			return executeBrowseUrl(input);

		case 'browser_click':
			return executeBrowserClick(input);

		case 'browser_type':
			return executeBrowserType(input);

		case 'browser_snapshot':
			return executeBrowserSnapshot();

		case 'browser_close':
			return executeBrowserClose();

		case 'browser_login':
			return executeBrowserLogin(input);

		default:
			return {
				success: false,
				message: `Unknown browser tool: ${toolName}`
			};
	}
}

/**
 * Browse URL Executor
 */
async function executeBrowseUrl(input: Record<string, unknown>): Promise<BrowserToolResult> {
	try {
		const url = input.url as string;

		if (!url) {
			return { success: false, message: 'url is required' };
		}

		const page = await browserSession.getPage();
		await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

		// Wait a bit for dynamic content
		await page.waitForTimeout(1000);

		const snapshot = await getPageSnapshot(page);

		return {
			success: true,
			message: `Navigated to ${url}`,
			data: { snapshot, url: page.url() }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to navigate: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Browser Click Executor
 */
async function executeBrowserClick(input: Record<string, unknown>): Promise<BrowserToolResult> {
	try {
		const ref = input.ref as string;
		const element = input.element as string;

		if (!ref) {
			return { success: false, message: 'ref is required' };
		}

		const page = await browserSession.getPage();

		// Try to find element by accessible name (the ref)
		const locator = page.getByRole('link', { name: ref }).or(
			page.getByRole('button', { name: ref })
		).or(
			page.getByText(ref)
		).first();

		await locator.click({ timeout: 5000 });

		// Wait for navigation or content update
		await page.waitForTimeout(1500);

		const snapshot = await getPageSnapshot(page);

		return {
			success: true,
			message: `Clicked: ${element || ref}`,
			data: { snapshot, url: page.url() }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to click: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Browser Type Executor
 */
async function executeBrowserType(input: Record<string, unknown>): Promise<BrowserToolResult> {
	try {
		const ref = input.ref as string;
		const text = input.text as string;
		const submit = input.submit as boolean;

		if (!ref || !text) {
			return { success: false, message: 'ref and text are required' };
		}

		const page = await browserSession.getPage();

		// Find input field by accessible name
		const locator = page.getByRole('textbox', { name: ref }).or(
			page.getByPlaceholder(ref)
		).or(
			page.locator(`input[name="${ref}"]`)
		).first();

		await locator.fill(text);

		if (submit) {
			await locator.press('Enter');
			await page.waitForTimeout(1500);
		}

		const snapshot = await getPageSnapshot(page);

		return {
			success: true,
			message: `Typed "${text.slice(0, 20)}${text.length > 20 ? '...' : ''}" into ${ref}`,
			data: { snapshot, url: page.url() }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to type: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Browser Snapshot Executor
 */
async function executeBrowserSnapshot(): Promise<BrowserToolResult> {
	try {
		if (!browserSession.isActive()) {
			return {
				success: false,
				message: 'No browser session active. Use browse_url to start.'
			};
		}

		const page = await browserSession.getPage();
		const snapshot = await getPageSnapshot(page);

		return {
			success: true,
			message: 'Page snapshot captured',
			data: { snapshot, url: page.url() }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to get snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Browser Close Executor
 */
async function executeBrowserClose(): Promise<BrowserToolResult> {
	try {
		await browserSession.close();
		return {
			success: true,
			message: 'Browser session closed'
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to close browser: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Browser Login Executor
 * Securely logs into a website using 1Password credentials
 * Credentials are NEVER exposed in the response
 */
async function executeBrowserLogin(input: Record<string, unknown>): Promise<BrowserToolResult> {
	try {
		const itemName = input.item_name as string;
		const usernameRef = input.username_ref as string;
		const passwordRef = input.password_ref as string;
		const submitRef = input.submit_ref as string | undefined;

		if (!itemName || !usernameRef || !passwordRef) {
			return { success: false, message: 'item_name, username_ref, and password_ref are required' };
		}

		if (!browserSession.isActive()) {
			return {
				success: false,
				message: 'No browser session active. Use browse_url to navigate to the login page first.'
			};
		}

		// Get credentials from 1Password (never exposed to Felix)
		const creds = await getCredentialFrom1Password(itemName);

		if (!creds) {
			return {
				success: false,
				message: `Could not retrieve credentials for "${itemName}" from 1Password. Either the item doesn't exist, or the 1Password session has expired. Ask Boss to run "op signin" in terminal to re-authenticate.`
			};
		}

		const page = await browserSession.getPage();

		// Fill username
		const usernameLocator = page.getByRole('textbox', { name: usernameRef }).or(
			page.getByPlaceholder(usernameRef)
		).or(
			page.locator(`input[name="${usernameRef}"]`)
		).or(
			page.locator(`input[type="email"]`)
		).first();

		await usernameLocator.fill(creds.username);

		// Fill password
		const passwordLocator = page.getByRole('textbox', { name: passwordRef }).or(
			page.getByPlaceholder(passwordRef)
		).or(
			page.locator(`input[name="${passwordRef}"]`)
		).or(
			page.locator(`input[type="password"]`)
		).first();

		await passwordLocator.fill(creds.password);

		// Submit
		if (submitRef) {
			const submitLocator = page.getByRole('button', { name: submitRef }).or(
				page.getByText(submitRef)
			).first();
			await submitLocator.click();
		} else {
			await passwordLocator.press('Enter');
		}

		// Wait for login to complete
		await page.waitForTimeout(3000);

		const snapshot = await getPageSnapshot(page);

		return {
			success: true,
			message: `Logged in as ${creds.username.slice(0, 3)}***`,
			data: { snapshot, url: page.url() }
		};
	} catch (error) {
		return {
			success: false,
			message: `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}
