/**
 * Channel: Discord
 *
 * Discord engagement requires Playwright MCP tools for navigation.
 * This module provides tool definitions and the extraction script.
 */

import type Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Fetch Discord Channel Tool
 * Returns the extraction script for forum channel thread listings.
 */
export const FETCH_DISCORD_CHANNEL_TOOL: Anthropic.Tool = {
	name: 'fetch_discord_channel',
	description:
		'Get the extraction script for fetching Discord forum channel thread listings. Returns JavaScript to run via Playwright browser_evaluate after navigating to a forum channel. Use this for step 2 of the workflow - discovering threads to engage with.',
	input_schema: {
		type: 'object',
		properties: {
			channel_url: {
				type: 'string',
				description: 'Discord forum channel URL (e.g., https://discord.com/channels/123/456)'
			}
		},
		required: []
	}
};

/**
 * Fetch Discord Thread Tool
 * Returns the extraction script to run via Playwright MCP.
 */
export const FETCH_DISCORD_THREAD_TOOL: Anthropic.Tool = {
	name: 'fetch_discord_thread',
	description:
		'Get the extraction script for fetching Discord messages from a thread. Since Discord requires browser automation, this returns the JavaScript to run via Playwright browser_evaluate. Use this for step 3 of the workflow - finding engagement opportunities in a specific thread.',
	input_schema: {
		type: 'object',
		properties: {
			thread_url: {
				type: 'string',
				description: 'Discord thread URL (click into a thread from forum channel first)'
			}
		},
		required: []
	}
};

export const DISCORD_TOOLS: Anthropic.Tool[] = [FETCH_DISCORD_CHANNEL_TOOL, FETCH_DISCORD_THREAD_TOOL];

// ============================================================================
// Extraction Scripts
// ============================================================================

/**
 * Forum channel extraction script - extracts thread listings.
 * Run this via browser_evaluate after navigating to a Discord forum channel.
 */
export const DISCORD_CHANNEL_EXTRACTION_SCRIPT = `
() => {
	const threads = [];
	const h3s = document.querySelectorAll('h3');

	const threadH3s = Array.from(h3s).filter(h => {
		const t = h.textContent?.trim() || '';
		return t.length > 5 &&
			!t.includes('┆') &&
			!t.includes('Get Started') &&
			!t.includes('Contact Us') &&
			!t.includes('Older Posts') &&
			!t.includes('Threads') &&
			!t.includes('Channels');
	});

	threadH3s.forEach(h3 => {
		const title = h3.textContent?.trim();
		const li = h3.closest('li');
		if (!li) return;

		const liText = li.textContent || '';

		// Time extraction
		let timeAgo = '';
		const timeMatch = liText.match(/(\\d+[hd]\\s*ago|>30d\\s*ago)/i);
		if (timeMatch) timeAgo = timeMatch[1];

		// Reply count - look for message/reply indicators
		let replies = 0;
		const replyMatch = liText.match(/(\\d+)\\s*(?:message|reply|replies|messages)/i);
		if (replyMatch) replies = parseInt(replyMatch[1], 10);
		// Fallback: look for standalone numbers near thread metadata
		if (replies === 0) {
			const numMatches = liText.match(/\\b(\\d{1,3})\\b/g);
			if (numMatches && numMatches.length > 0) {
				// Take the largest number that's reasonable for reply count
				const nums = numMatches.map(n => parseInt(n, 10)).filter(n => n > 0 && n < 1000);
				if (nums.length > 0) replies = Math.max(...nums);
			}
		}

		// Author - find button near "post author" indicator
		let author = 'Unknown';
		const buttons = li.querySelectorAll('button');
		buttons.forEach(btn => {
			const btnText = btn.textContent || '';
			const parent = btn.parentElement;
			if (parent?.textContent?.includes('post author')) {
				author = btnText.trim();
			}
		});

		threads.push({ title, author, timeAgo, replies });
	});

	// Sort by replies descending - most engaged threads first
	threads.sort((a, b) => b.replies - a.replies);

	return { channelUrl: window.location.href, threads };
}
`;

/**
 * Thread extraction script - extracts messages from a Discord thread.
 * Run this via browser_evaluate after clicking into a thread.
 * Collects 400+ words of messages, filters spam/roleplay pastes.
 */
export const DISCORD_THREAD_EXTRACTION_SCRIPT = `
async () => {
	const TARGET_WORDS = 400;
	const MIN_WORDS = 10;
	const MAX_WORDS = 80;
	const MAX_ITERATIONS = 10;

	const seenContent = new Set();
	const allMessages = [];

	// Find Discord's message scroller
	const scroller = document.querySelector('[class*="scrollerInner"]')?.parentElement;
	if (!scroller) return { error: 'No scroller found' };

	// Start at bottom (most recent)
	scroller.scrollTop = scroller.scrollHeight;
	await new Promise(r => setTimeout(r, 500));

	let totalWords = 0;
	let iterations = 0;

	while (totalWords < TARGET_WORDS && iterations < MAX_ITERATIONS) {
		iterations++;

		const messages = document.querySelectorAll('[id^="chat-messages-"]');

		for (const msg of messages) {
			// Stop if we have enough
			if (totalWords >= TARGET_WORDS) break;

			// Extract username, strip role badges
			const usernameEl = msg.querySelector('[id^="message-username-"]');
			let username = usernameEl ? usernameEl.textContent.trim() : '';
			username = username.split(/(?:Character Creators|Server Booster|c\\.ai|GOJO|COD|TVA|FARM|KIN|Moderator|Admin|Developer|Staff|Patron|Subscriber|Member|VIP)/i)[0].trim();

			// Extract content, strip edit timestamps
			const contentEl = msg.querySelector('[id^="message-content-"]');
			let content = contentEl ? contentEl.textContent.trim() : '';
			content = content.replace(/\\s*\\(edited\\).*$/i, '').trim();

			// Skip empty or duplicate
			if (!content || seenContent.has(content)) continue;
			seenContent.add(content);

			// Word count filter (skip spam and roleplay pastes)
			const wordCount = content.split(/\\s+/).filter(w => w.length > 0).length;
			if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) continue;

			// Extract message ID for direct link
			const msgId = msg.id.split('-').pop();

			allMessages.push({
				username,
				content: content.substring(0, 400),
				wordCount,
				msgId
			});

			totalWords += wordCount;
		}

		// Scroll up if need more
		if (totalWords < TARGET_WORDS) {
			scroller.scrollTop = Math.max(0, scroller.scrollTop - 800);
			await new Promise(r => setTimeout(r, 500));
		}
	}

	// Sort by message ID (chronological)
	allMessages.sort((a, b) => a.msgId.localeCompare(b.msgId));

	// Build direct links
	const channelPath = window.location.pathname;

	return {
		totalWords,
		messageCount: allMessages.length,
		iterations,
		messages: allMessages.map(m => ({
			...m,
			link: 'https://discord.com' + channelPath + '/' + m.msgId
		}))
	};
}
`;

// ============================================================================
// Types
// ============================================================================

export interface DiscordMessage {
	username: string;
	content: string;
	wordCount: number;
	msgId: string;
	link: string;
}

export interface DiscordExtractionResult {
	totalWords: number;
	messageCount: number;
	iterations: number;
	messages: DiscordMessage[];
	error?: string;
}

export interface DiscordToolResult {
	success: boolean;
	message: string;
	channel_url?: string;
	extraction_script?: string;
	instructions?: string;
}

// ============================================================================
// Tool Executors
// ============================================================================

/**
 * Execute fetch_discord_channel tool
 * Returns the channel extraction script for forum thread listings.
 */
export function executeFetchDiscordChannel(
	input: Record<string, unknown>
): DiscordToolResult {
	const channelUrl = input.channel_url as string | undefined;

	const instructions = `
## Discord Forum Channel Extraction

1. **Navigate**: Use browser_navigate to go to the Discord forum channel
2. **Wait**: Use browser_wait_for with time: 3 to let threads load
3. **Extract**: Use browser_evaluate with the channel extraction script
4. **Select**: Pick a thread with engagement potential (complaints/frustration)
5. **Click**: Use browser_click on the thread title to open it

### Channel Extraction Script

\`\`\`javascript
${DISCORD_CHANNEL_EXTRACTION_SCRIPT}
\`\`\`

Returns thread listings with title, author, and time.
`.trim();

	return {
		success: true,
		message: channelUrl
			? `Ready to extract threads from ${channelUrl}. Navigate and run the channel extraction script.`
			: 'Channel extraction script ready. Navigate to a Discord forum channel first.',
		channel_url: channelUrl,
		extraction_script: DISCORD_CHANNEL_EXTRACTION_SCRIPT,
		instructions
	};
}

/**
 * Execute fetch_discord_thread tool
 * Returns the thread extraction script for message extraction.
 */
export function executeFetchDiscordThread(
	input: Record<string, unknown>
): DiscordToolResult {
	const threadUrl = input.thread_url as string | undefined;

	const instructions = `
## Discord Thread Extraction

1. **Click**: Click into a thread from the forum channel listing
2. **Wait**: Use browser_wait_for with time: 2 to let messages load
3. **Extract**: Use browser_evaluate with the thread extraction script
4. **Analyze**: Review messages for engagement opportunities
5. **Pick**: Find a message worth replying to, use the direct link

### Thread Extraction Script

\`\`\`javascript
${DISCORD_THREAD_EXTRACTION_SCRIPT}
\`\`\`

The script will:
- Collect messages until 400+ words accumulated
- Filter out spam (< 10 words) and roleplay pastes (> 80 words)
- Strip role badges from usernames
- Return messages with direct reply links
`.trim();

	return {
		success: true,
		message: threadUrl
			? `Ready to extract from ${threadUrl}. Run the thread extraction script.`
			: 'Thread extraction script ready. Click into a thread first, then run the script.',
		channel_url: threadUrl,
		extraction_script: DISCORD_THREAD_EXTRACTION_SCRIPT,
		instructions
	};
}

/**
 * Execute Discord tool by name
 */
export function executeDiscordTool(
	toolName: string,
	input: Record<string, unknown>
): DiscordToolResult {
	switch (toolName) {
		case 'fetch_discord_channel':
			return executeFetchDiscordChannel(input);
		case 'fetch_discord_thread':
			return executeFetchDiscordThread(input);
		default:
			return { success: false, message: `Unknown Discord tool: ${toolName}` };
	}
}

/**
 * Check if a tool name is a Discord tool
 */
export function isDiscordTool(toolName: string): boolean {
	return ['fetch_discord_channel', 'fetch_discord_thread'].includes(toolName);
}
