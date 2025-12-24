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
 * Fetch Discord Thread Tool
 * Returns the extraction script to run via Playwright MCP.
 */
export const FETCH_DISCORD_THREAD_TOOL: Anthropic.Tool = {
	name: 'fetch_discord_thread',
	description:
		'Get the extraction script for fetching Discord messages. Since Discord requires browser automation, this returns the JavaScript to run via Playwright browser_evaluate. Boss will navigate to the channel and run the extraction.',
	input_schema: {
		type: 'object',
		properties: {
			channel_url: {
				type: 'string',
				description: 'Discord channel URL (e.g., https://discord.com/channels/123/456)'
			}
		},
		required: []
	}
};

export const DISCORD_TOOLS: Anthropic.Tool[] = [FETCH_DISCORD_THREAD_TOOL];

// ============================================================================
// Extraction Script
// ============================================================================

/**
 * The extraction script to run in Discord via browser_evaluate.
 * Collects 400+ words of messages, filters spam/roleplay pastes.
 */
export const DISCORD_EXTRACTION_SCRIPT = `
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

		messages.forEach(msg => {
			// Extract username, strip role badges
			const usernameEl = msg.querySelector('[id^="message-username-"]');
			let username = usernameEl ? usernameEl.textContent.trim() : '';
			username = username.split(/(?:Character Creators|Server Booster|c\\.ai|GOJO|COD|TVA|FARM|KIN|Moderator|Admin|Developer|Staff|Patron|Subscriber|Member|VIP)/i)[0].trim();

			// Extract content, strip edit timestamps
			const contentEl = msg.querySelector('[id^="message-content-"]');
			let content = contentEl ? contentEl.textContent.trim() : '';
			content = content.replace(/\\s*\\(edited\\).*$/i, '').trim();

			// Skip empty or duplicate
			if (!content || seenContent.has(content)) return;
			seenContent.add(content);

			// Word count filter (skip spam and roleplay pastes)
			const wordCount = content.split(/\\s+/).filter(w => w.length > 0).length;
			if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) return;

			// Extract message ID for direct link
			const msgId = msg.id.split('-').pop();

			allMessages.push({
				username,
				content: content.substring(0, 400),
				wordCount,
				msgId
			});
		});

		totalWords = allMessages.reduce((sum, m) => sum + m.wordCount, 0);

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
// Tool Executor
// ============================================================================

/**
 * Execute fetch_discord_thread tool
 * Returns the extraction script and instructions for Playwright navigation.
 */
export function executeFetchDiscordThread(
	input: Record<string, unknown>
): DiscordToolResult {
	const channelUrl = input.channel_url as string | undefined;

	const instructions = `
## Discord Extraction Workflow

1. **Navigate**: Use browser_navigate to go to the Discord channel
2. **Wait**: Use browser_wait_for with time: 2 to let messages load
3. **Extract**: Use browser_evaluate with the extraction script below
4. **Analyze**: Review the extracted messages for engagement opportunities

### Extraction Script

Run this via browser_evaluate:

\`\`\`javascript
${DISCORD_EXTRACTION_SCRIPT}
\`\`\`

The script will:
- Collect messages until 400+ words accumulated
- Filter out spam (< 10 words) and roleplay pastes (> 80 words)
- Strip role badges from usernames
- Remove "(edited)" timestamps
- Return messages with direct reply links
`.trim();

	return {
		success: true,
		message: channelUrl
			? `Ready to extract from ${channelUrl}. Use Playwright MCP tools to navigate and run the extraction script.`
			: 'Extraction script ready. Provide a channel_url or navigate manually, then run the extraction script.',
		channel_url: channelUrl,
		extraction_script: DISCORD_EXTRACTION_SCRIPT,
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
	return ['fetch_discord_thread'].includes(toolName);
}
