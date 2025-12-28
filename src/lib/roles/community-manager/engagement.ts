/**
 * Engagement Pipeline
 *
 * Single-model: Ananya writes comments directly in conversation.
 *
 * Tools:
 * - log_engagement: Increment engagement score for a subreddit after drafting
 */

import type Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

// ============================================================================
// Types
// ============================================================================

export interface LogEngagementResult {
	success: boolean;
	message: string;
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Log Engagement Tool
 * Increments the engagement score for a subreddit after Ananya drafts a comment.
 */
export const LOG_ENGAGEMENT_TOOL: Anthropic.Tool = {
	name: 'log_engagement',
	description:
		'Log that you drafted a comment for a subreddit. Call this after you provide a draft. Increments the engagement score so you rotate to other subreddits next time.',
	input_schema: {
		type: 'object',
		properties: {
			subreddit: {
				type: 'string',
				description: 'Subreddit name (e.g., "Replika" or "CharacterAI")'
			}
		},
		required: ['subreddit']
	}
};

// ============================================================================
// Tool Executors
// ============================================================================

/**
 * Execute log_engagement tool
 * Increments engagement_score by 1 for the given subreddit
 */
export async function executeLogEngagement(
	input: Record<string, unknown>
): Promise<LogEngagementResult> {
	const subreddit = input.subreddit as string;

	if (!subreddit) {
		return { success: false, message: 'Missing subreddit parameter' };
	}

	try {
		// First get the current score
		const { data: current, error: fetchError } = await supabase
			.from('subreddit_registry')
			.select('engagement_score')
			.eq('name', subreddit)
			.single();

		if (fetchError || !current) {
			return { success: false, message: `Subreddit not found: ${subreddit}` };
		}

		// Increment the score
		const { error: updateError } = await supabase
			.from('subreddit_registry')
			.update({ engagement_score: current.engagement_score + 1 })
			.eq('name', subreddit);

		if (updateError) {
			return { success: false, message: `Failed to update: ${updateError.message}` };
		}

		return {
			success: true,
			message: `Logged engagement for r/${subreddit} (score: ${current.engagement_score + 1})`
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

export const ENGAGEMENT_TOOLS: Anthropic.Tool[] = [LOG_ENGAGEMENT_TOOL];

export function isEngagementTool(toolName: string): boolean {
	return toolName === 'log_engagement';
}

export type EngagementToolResult = LogEngagementResult;

export async function executeEngagementTool(
	toolName: string,
	input: Record<string, unknown>
): Promise<EngagementToolResult> {
	switch (toolName) {
		case 'log_engagement':
			return executeLogEngagement(input);
		default:
			return { success: false, message: `Unknown engagement tool: ${toolName}` };
	}
}
