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
 * Update Engagement Tool
 * Updates an existing engagement log entry (e.g., when comment was revised).
 */
export const UPDATE_ENGAGEMENT_TOOL: Anthropic.Tool = {
	name: 'update_engagement',
	description:
		'Update an existing engagement log entry. Use this when Boss revised a comment after it was already logged. Matches by post_url.',
	input_schema: {
		type: 'object',
		properties: {
			post_url: {
				type: 'string',
				description: 'Full URL of the post or thread (used to find the log entry)'
			},
			comment_text: {
				type: 'string',
				description: 'The revised comment text'
			},
			notes: {
				type: 'string',
				description: 'Optional updated notes'
			}
		},
		required: ['post_url', 'comment_text']
	}
};

/**
 * Delete Engagement Tool
 * Deletes an engagement log entry (e.g., when comment was not posted).
 */
export const DELETE_ENGAGEMENT_TOOL: Anthropic.Tool = {
	name: 'delete_engagement',
	description:
		'Delete an engagement log entry. Use this when Boss decided not to post the comment or wants to remove a log entry. Matches by post_url.',
	input_schema: {
		type: 'object',
		properties: {
			post_url: {
				type: 'string',
				description: 'Full URL of the post or thread (used to find the log entry)'
			}
		},
		required: ['post_url']
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
			comment_url: {
				type: 'string',
				description: 'Permalink to the specific comment Boss posted (for metrics tracking)'
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
	const commentUrl = input.comment_url as string | undefined;
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
			comment_url: commentUrl,
			notes
		});

		if (insertError) {
			return { success: false, message: `Failed to log engagement: ${insertError.message}` };
		}

		// Update last_engaged on community
		await updateSubredditEngagement(community);

		const prefix = platform === 'reddit' ? 'r/' : '';
		const metricsNote = commentUrl ? ' Metrics tracking enabled.' : ' (No comment_url - metrics tracking disabled)';
		return {
			success: true,
			message: `Logged ${platform} engagement in ${prefix}${community}. Community last_engaged updated.${metricsNote}`
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to log engagement: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Execute update_engagement tool
 * Updates an existing engagement log entry by post_url.
 */
export async function executeUpdateEngagement(
	input: Record<string, unknown>
): Promise<LogEngagementResult> {
	const postUrl = input.post_url as string;
	const commentText = input.comment_text as string;
	const notes = input.notes as string | undefined;

	if (!postUrl || !commentText) {
		return { success: false, message: 'Missing required parameters: post_url and comment_text' };
	}

	try {
		const updateData: Record<string, string> = { comment_text: commentText };
		if (notes !== undefined) {
			updateData.notes = notes;
		}

		const { error, count } = await supabase
			.from('engagement_log')
			.update(updateData)
			.eq('post_url', postUrl);

		if (error) {
			return { success: false, message: `Failed to update engagement: ${error.message}` };
		}

		if (count === 0) {
			return { success: false, message: `No engagement found for URL: ${postUrl}` };
		}

		return { success: true, message: `Updated engagement log for: ${postUrl}` };
	} catch (error) {
		return {
			success: false,
			message: `Failed to update engagement: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Execute delete_engagement tool
 * Deletes an engagement log entry by post_url.
 */
export async function executeDeleteEngagement(
	input: Record<string, unknown>
): Promise<LogEngagementResult> {
	const postUrl = input.post_url as string;

	if (!postUrl) {
		return { success: false, message: 'Missing required parameter: post_url' };
	}

	try {
		const { error, count } = await supabase
			.from('engagement_log')
			.delete()
			.eq('post_url', postUrl);

		if (error) {
			return { success: false, message: `Failed to delete engagement: ${error.message}` };
		}

		if (count === 0) {
			return { success: false, message: `No engagement found for URL: ${postUrl}` };
		}

		return { success: true, message: `Deleted engagement log for: ${postUrl}` };
	} catch (error) {
		return {
			success: false,
			message: `Failed to delete engagement: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

// ============================================================================
// Exports
// ============================================================================

// Reddit engagement tools (Ananya)
export const REDDIT_ENGAGEMENT_TOOLS: Anthropic.Tool[] = [
	GET_SUBREDDIT_REGISTRY_TOOL,
	LOG_ENGAGEMENT_TOOL,
	UPDATE_ENGAGEMENT_TOOL,
	DELETE_ENGAGEMENT_TOOL
];

// Discord engagement tools (Nico)
export const DISCORD_ENGAGEMENT_TOOLS: Anthropic.Tool[] = [
	GET_DISCORD_CHANNEL_REGISTRY_TOOL,
	LOG_ENGAGEMENT_TOOL,
	UPDATE_ENGAGEMENT_TOOL,
	DELETE_ENGAGEMENT_TOOL
];

// All engagement tools (for backwards compatibility)
export const ENGAGEMENT_TOOLS: Anthropic.Tool[] = [
	GET_SUBREDDIT_REGISTRY_TOOL,
	GET_DISCORD_CHANNEL_REGISTRY_TOOL,
	LOG_ENGAGEMENT_TOOL,
	UPDATE_ENGAGEMENT_TOOL,
	DELETE_ENGAGEMENT_TOOL
];

export function isEngagementTool(toolName: string): boolean {
	return ['get_subreddit_registry', 'get_discord_channel_registry', 'log_engagement', 'update_engagement', 'delete_engagement'].includes(toolName);
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
		case 'update_engagement':
			return executeUpdateEngagement(input);
		case 'delete_engagement':
			return executeDeleteEngagement(input);
		default:
			return { success: false, message: `Unknown engagement tool: ${toolName}` };
	}
}
