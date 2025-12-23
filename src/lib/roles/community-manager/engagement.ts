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

export interface SubredditEntry {
	id: string;
	name: string;
	url: string;
	tier: number;
	platform: string;
	last_engaged: string | null;
	notes: string | null;
}

export interface SubredditRegistryResult {
	success: boolean;
	message: string;
	data?: SubredditEntry[];
}

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
		'Get the list of subreddits to consider for community engagement. Returns subreddits organized by tier (1=daily, 2=2-3x weekly, 3=weekly, 4=weekly scan). Use this when Boss asks to start community engagement.',
	input_schema: {
		type: 'object',
		properties: {
			tier: {
				type: 'number',
				description: 'Optional: filter by tier (1-4). If not provided, returns all tiers.'
			}
		},
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
		'Log that Boss posted a comment. Call this when Boss confirms they posted the drafted comment. Updates engagement history and subreddit last_engaged timestamp.',
	input_schema: {
		type: 'object',
		properties: {
			subreddit: {
				type: 'string',
				description: 'Subreddit name (e.g., "Replika" or "NomiAI")'
			},
			post_url: {
				type: 'string',
				description: 'Full URL of the Reddit post'
			},
			post_title: {
				type: 'string',
				description: 'Title of the post'
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
		required: ['subreddit', 'post_url', 'post_title', 'comment_text']
	}
};

// ============================================================================
// Tool Executors
// ============================================================================

/**
 * Execute get_subreddit_registry tool
 */
export async function executeGetSubredditRegistry(
	input: Record<string, unknown>
): Promise<SubredditRegistryResult> {
	const tier = input.tier as number | undefined;

	try {
		let query = supabase
			.from('subreddit_registry')
			.select('*')
			.eq('platform', 'reddit')
			.order('tier', { ascending: true })
			.order('last_engaged', { ascending: true, nullsFirst: true });

		if (tier !== undefined) {
			query = query.eq('tier', tier);
		}

		const { data, error } = await query;

		if (error) {
			return { success: false, message: `Database error: ${error.message}` };
		}

		return {
			success: true,
			message: `Found ${data.length} subreddits`,
			data: data as SubredditEntry[]
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
 * Logs to engagement_log and updates subreddit last_engaged.
 */
export async function executeLogEngagement(
	input: Record<string, unknown>
): Promise<LogEngagementResult> {
	const subreddit = (input.subreddit as string)?.replace(/^r\//, '');
	const postUrl = input.post_url as string;
	const postTitle = input.post_title as string;
	const commentText = input.comment_text as string;
	const notes = input.notes as string | undefined;

	if (!subreddit || !postUrl || !postTitle || !commentText) {
		return { success: false, message: 'Missing required parameters' };
	}

	try {
		// Insert into engagement_log
		const { error: insertError } = await supabase.from('engagement_log').insert({
			subreddit,
			platform: 'reddit',
			post_url: postUrl,
			post_title: postTitle,
			comment_text: commentText,
			notes
		});

		if (insertError) {
			return { success: false, message: `Failed to log engagement: ${insertError.message}` };
		}

		// Update last_engaged on subreddit
		await updateSubredditEngagement(subreddit);

		return {
			success: true,
			message: `Logged engagement in r/${subreddit}. Subreddit last_engaged updated.`
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

export const ENGAGEMENT_TOOLS: Anthropic.Tool[] = [
	GET_SUBREDDIT_REGISTRY_TOOL,
	LOG_ENGAGEMENT_TOOL
];

export function isEngagementTool(toolName: string): boolean {
	return ['get_subreddit_registry', 'log_engagement'].includes(toolName);
}

export type EngagementToolResult = SubredditRegistryResult | LogEngagementResult;

export async function executeEngagementTool(
	toolName: string,
	input: Record<string, unknown>
): Promise<EngagementToolResult> {
	switch (toolName) {
		case 'get_subreddit_registry':
			return executeGetSubredditRegistry(input);
		case 'log_engagement':
			return executeLogEngagement(input);
		default:
			return { success: false, message: `Unknown engagement tool: ${toolName}` };
	}
}
