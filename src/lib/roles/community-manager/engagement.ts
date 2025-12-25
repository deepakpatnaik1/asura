/**
 * Engagement Pipeline
 *
 * Single-model: Ananya writes comments directly in conversation.
 *
 * Tools:
 * - get_subreddit_registry: Select communities to engage
 * - log_engagement: Record that Boss posted a comment
 */

import type Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

// ============================================================================
// Types
// ============================================================================

export interface CommunityEntry {
	id: string;
	name: string;
	url: string;
	platform: string;
	last_engaged: string | null;
	notes: string | null;
}

// Alias for backwards compatibility
export type SubredditEntry = CommunityEntry;

export interface RegistryResult {
	success: boolean;
	message: string;
	data?: CommunityEntry[];
}

// Alias for backwards compatibility
export type SubredditRegistryResult = RegistryResult;

export interface LogEngagementResult {
	success: boolean;
	message: string;
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Get Subreddit Registry Tool
 * Returns the list of subreddits Ananya should consider for engagement.
 */
export const GET_SUBREDDIT_REGISTRY_TOOL: Anthropic.Tool = {
	name: 'get_subreddit_registry',
	description:
		'Get the list of subreddits to consider for community engagement. Returns subreddits ordered by last_engaged (oldest first). Use this when Boss asks to start community engagement.',
	input_schema: {
		type: 'object',
		properties: {},
		required: []
	}
};

/**
 * Get Discord Channel Registry Tool
 * Returns the list of curated Discord forum channels Nico should consider for engagement.
 */
export const GET_DISCORD_CHANNEL_REGISTRY_TOOL: Anthropic.Tool = {
	name: 'get_discord_channel_registry',
	description:
		'Get the list of curated Discord forum channels for community engagement. Returns specific channel URLs (not servers) ordered by last_engaged (oldest first). Use this when Boss asks to start Discord engagement.',
	input_schema: {
		type: 'object',
		properties: {},
		required: []
	}
};

/**
 * Log Engagement Tool
 * Records that Boss posted a comment. Updates engagement_log and last_engaged.
 */
export const LOG_ENGAGEMENT_TOOL: Anthropic.Tool = {
	name: 'log_engagement',
	description:
		'Log that Boss posted a comment. Call this when Boss confirms they posted the drafted comment. Updates engagement history and community last_engaged timestamp. Works for both Reddit and Discord.',
	input_schema: {
		type: 'object',
		properties: {
			community: {
				type: 'string',
				description: 'Community name (e.g., "Replika", "NomiAI", "Candy AI")'
			},
			platform: {
				type: 'string',
				enum: ['reddit', 'discord'],
				description: 'Platform: "reddit" or "discord" (default: reddit)'
			},
			post_url: {
				type: 'string',
				description: 'Full URL of the post or thread'
			},
			post_title: {
				type: 'string',
				description: 'Title of the post or thread'
			},
			comment_text: {
				type: 'string',
				description: 'The comment that was posted'
			},
			notes: {
				type: 'string',
				description: 'Optional notes about this engagement'
			}
		},
		required: ['community', 'post_url', 'post_title', 'comment_text']
	}
};

// ============================================================================
// Tool Executors
// ============================================================================

/**
 * Execute get_subreddit_registry tool
 */
export async function executeGetSubredditRegistry(
	_input: Record<string, unknown>
): Promise<RegistryResult> {
	try {
		const { data, error } = await supabase
			.from('subreddit_registry')
			.select('*')
			.eq('platform', 'reddit')
			.order('last_engaged', { ascending: true, nullsFirst: true });

		if (error) {
			return { success: false, message: `Database error: ${error.message}` };
		}

		return {
			success: true,
			message: `Found ${data.length} subreddits`,
			data: data as CommunityEntry[]
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to fetch registry: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Execute get_discord_channel_registry tool
 */
export async function executeGetDiscordChannelRegistry(
	_input: Record<string, unknown>
): Promise<RegistryResult> {
	try {
		const { data, error } = await supabase
			.from('subreddit_registry')
			.select('*')
			.eq('platform', 'discord')
			.order('last_engaged', { ascending: true, nullsFirst: true });

		if (error) {
			return { success: false, message: `Database error: ${error.message}` };
		}

		return {
			success: true,
			message: `Found ${data.length} Discord channels`,
			data: data as CommunityEntry[]
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to fetch registry: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Update last_engaged timestamp for a subreddit
 */
async function updateSubredditEngagement(subredditName: string): Promise<void> {
	await supabase
		.from('subreddit_registry')
		.update({ last_engaged: new Date().toISOString() })
		.eq('name', subredditName);
}

/**
 * Execute log_engagement tool
 * Logs to engagement_log and updates community last_engaged.
 */
export async function executeLogEngagement(
	input: Record<string, unknown>
): Promise<LogEngagementResult> {
	// Support both old 'subreddit' param and new 'community' param
	const community = (input.community as string) || (input.subreddit as string)?.replace(/^r\//, '');
	const platform = (input.platform as string) || 'reddit';
	const postUrl = input.post_url as string;
	const postTitle = input.post_title as string;
	const commentText = input.comment_text as string;
	const notes = input.notes as string | undefined;

	if (!community || !postUrl || !postTitle || !commentText) {
		return { success: false, message: 'Missing required parameters' };
	}

	try {
		// Insert into engagement_log
		const { error: insertError } = await supabase.from('engagement_log').insert({
			subreddit: community,
			platform,
			post_url: postUrl,
			post_title: postTitle,
			comment_text: commentText,
			notes
		});

		if (insertError) {
			return { success: false, message: `Failed to log engagement: ${insertError.message}` };
		}

		// Update last_engaged on community
		await updateSubredditEngagement(community);

		const prefix = platform === 'reddit' ? 'r/' : '';
		return {
			success: true,
			message: `Logged ${platform} engagement in ${prefix}${community}. Community last_engaged updated.`
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to log engagement: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

// ============================================================================
// Exports
// ============================================================================

// Reddit engagement tools (Ananya)
export const REDDIT_ENGAGEMENT_TOOLS: Anthropic.Tool[] = [
	GET_SUBREDDIT_REGISTRY_TOOL,
	LOG_ENGAGEMENT_TOOL
];

// Discord engagement tools (Nico)
export const DISCORD_ENGAGEMENT_TOOLS: Anthropic.Tool[] = [
	GET_DISCORD_CHANNEL_REGISTRY_TOOL,
	LOG_ENGAGEMENT_TOOL
];

// All engagement tools (for backwards compatibility)
export const ENGAGEMENT_TOOLS: Anthropic.Tool[] = [
	GET_SUBREDDIT_REGISTRY_TOOL,
	GET_DISCORD_CHANNEL_REGISTRY_TOOL,
	LOG_ENGAGEMENT_TOOL
];

export function isEngagementTool(toolName: string): boolean {
	return ['get_subreddit_registry', 'get_discord_channel_registry', 'log_engagement'].includes(toolName);
}

export type EngagementToolResult = RegistryResult | LogEngagementResult;

export async function executeEngagementTool(
	toolName: string,
	input: Record<string, unknown>
): Promise<EngagementToolResult> {
	switch (toolName) {
		case 'get_subreddit_registry':
			return executeGetSubredditRegistry(input);
		case 'get_discord_channel_registry':
			return executeGetDiscordChannelRegistry(input);
		case 'log_engagement':
			return executeLogEngagement(input);
		default:
			return { success: false, message: `Unknown engagement tool: ${toolName}` };
	}
}
