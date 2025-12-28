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

// ============================================================================
// Exports
// ============================================================================

// Reddit engagement tools (Ananya)
export const REDDIT_ENGAGEMENT_TOOLS: Anthropic.Tool[] = [
	GET_SUBREDDIT_REGISTRY_TOOL
];

// All engagement tools
export const ENGAGEMENT_TOOLS: Anthropic.Tool[] = [
	GET_SUBREDDIT_REGISTRY_TOOL
];

export function isEngagementTool(toolName: string): boolean {
	return toolName === 'get_subreddit_registry';
}

export type EngagementToolResult = RegistryResult;

export async function executeEngagementTool(
	toolName: string,
	input: Record<string, unknown>
): Promise<EngagementToolResult> {
	switch (toolName) {
		case 'get_subreddit_registry':
			return executeGetSubredditRegistry(input);
		default:
			return { success: false, message: `Unknown engagement tool: ${toolName}` };
	}
}
