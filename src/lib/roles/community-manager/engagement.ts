/**
 * Engagement Pipeline
 *
 * Two-model architecture:
 * - Ananya (Haiku) orchestrates the daisy chain workflow
 * - draft_comment tool calls Opus for comment generation
 *
 * Tools:
 * - get_subreddit_registry: Select communities to engage
 * - draft_comment: Generate a comment via Opus (minimal context)
 * - log_engagement: Record that Boss posted a comment
 *
 * ---
 * TODO: Add to Aether Addendum canon doc for Ananya:
 *
 * "First-order models (personas): Multi-dimensional, ongoing relationship,
 * continuous feedback. Like real team members.
 *
 * Second-order models (workers): Single job, calibrate once, steady state.
 * Fire and forget."
 * ---
 */

import type Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createMessage } from '$lib/api/anthropic-client';
import { createSimpleLogger } from '$lib/api/logger';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
const log = createSimpleLogger('Engagement');

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

export interface DraftCommentResult {
	success: boolean;
	message: string;
	comment?: string;
}

// ============================================================================
// Comment Generator Prompt (Opus)
// ============================================================================

/**
 * Minimal, focused prompt for Opus comment generation.
 * Voice examples are HARDCODED - no dynamic injection.
 * Opus receives: this prompt + thread context + opportunity.
 * NO conversation history, NO orchestration context.
 */
const COMMENT_GENERATOR_PROMPT = `You generate Reddit comments for Boss to copy-paste.

Boss runs an AI companion startup. He's building presence in AI companion communities over months. Not marketing. Not promotion. Becoming a known, trusted voice. Quality over quantity.

## Voice

Systemic analysis delivered casually. You see the underlying patterns - incentive structures, product dynamics, industry bullshit - and explain them in plain language. Thoughtful but not formal. Analytical but not academic.

Casual markers: "tbh", "tho", "ugh", "like" as filler, missing apostrophes in "its/thats", "??" for emphasis. Capitalize first letter of each sentence.

Structure: Multi-paragraph when the thought needs it. Build the argument.

Signature moves: "The thing that kills me", "Worst of both worlds", "Doesn't make it less frustrating tho"

## Examples

**Example 1:**
"This is the classic product team trap tbh. UI changes are visible, shippable, and look like progress in sprint reviews. Fixing the actual hard problems - chat quality, filter tuning, the stuff that requires real engineering work - thats invisible to leadership until its done

So you end up with teams optimizing for "things we can show in the weekly demo" instead of "things users actually need." The button got moved! The animation is smoother! Meanwhile the core experience is still broken but thats a 6 month project with no flashy before/after screenshots

Its not malice its just... incentive structures. Doesn't make it less frustrating tho especially when you're paying for plus"

**Example 2:**
"The media illiteracy point is so real tho. Like we've somehow forgotten that fiction can explore dark shit without endorsing it?? Every great story has conflict and moral complexity and now we're stuck in this sanitized version where characters can't even be sad without triggering a wellness check

Ugh"

**Example 3:**
"The lawsuit angle is 100% it but its also just... the economics of scale? Like once you have millions of users you stop optimizing for user experience and start optimizing for "what percentage of edge cases could become headlines"

Its not even about protecting users at that point its about protecting the company from the 0.01% worst case scenario. Which means the 99.99% of normal adults who just want to write complex stories get treated like potential liabilities

The age gate was supposed to fix this but turns out it was just step one of "we did something" for the lawyers"

**Example 4:**
"This is the thing that kills me. The age verification was supposed to be the solution right? "Ok minors are out, adults can have adult experiences"

But it was never actually about age it was about liability theater. The 18+ gate lets them say "we tried" in court while the actual product stays sanitized because thats easier than building nuanced content moderation

So now we're in this weird middle ground where the app is technically for adults but the experience is designed for the most cautious possible interpretation of what adults might do. Worst of both worlds"

## Forbidden

- AI-speak, polish, corporate language
- "Great question!" / "I hope this helps!" / "Happy to help!"
- Perfect grammar and structure - thats a giveaway
- Sales pitch, ulterior motives
- Mentioning our product or company, or hinting that you're building something
- Bullet points (use prose)
- Em dashes (use hyphens or en dashes with spaces instead)

## Output

Return ONLY the comment text. No explanation, no preamble, no "Here's a comment:". Just the raw comment ready to paste.`;

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

/**
 * Draft Comment Tool
 * Calls Opus to generate a comment. Minimal context - only thread + voice.
 */
export const DRAFT_COMMENT_TOOL: Anthropic.Tool = {
	name: 'draft_comment',
	description:
		'Generate a Reddit comment using Opus. Provide the thread context and target opportunity. Returns a copy-paste ready comment.',
	input_schema: {
		type: 'object',
		properties: {
			thread_context: {
				type: 'string',
				description: 'The Reddit thread content (post + relevant comments)'
			},
			target_author: {
				type: 'string',
				description: 'Username of the comment/post being replied to'
			},
			target_snippet: {
				type: 'string',
				description: 'First few words of the comment/post being replied to'
			},
			why_engage: {
				type: 'string',
				description: 'Brief explanation of why this is worth engaging (which factors it touches)'
			}
		},
		required: ['thread_context', 'target_author', 'target_snippet', 'why_engage']
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

/**
 * Execute draft_comment tool
 * Calls Opus with minimal context: thread + opportunity.
 * Voice examples are hardcoded in COMMENT_GENERATOR_PROMPT.
 */
export async function executeDraftComment(
	input: Record<string, unknown>,
	commentGeneratorModel: string
): Promise<DraftCommentResult> {
	const threadContext = input.thread_context as string;
	const targetAuthor = input.target_author as string;
	const targetSnippet = input.target_snippet as string;
	const whyEngage = input.why_engage as string;

	if (!threadContext || !targetAuthor || !targetSnippet || !whyEngage) {
		return { success: false, message: 'Missing required parameters' };
	}

	try {
		log.info('Generating comment via Opus', { model: commentGeneratorModel, targetAuthor });

		// Build the user message - voice examples are in the system prompt
		const userMessage = `## Thread

${threadContext}

## Target

Replying to ${targetAuthor}: "${targetSnippet}..."

## Why This Matters

${whyEngage}

Generate a comment for this opportunity.`;

		// Call Opus with minimal context + prompt caching
		const systemWithCache: Anthropic.Messages.TextBlockParam[] = [
			{
				type: 'text',
				text: COMMENT_GENERATOR_PROMPT,
				cache_control: { type: 'ephemeral', ttl: '1h' }
			}
		];

		const response = await createMessage({
			model: commentGeneratorModel,
			max_tokens: 500,
			temperature: 0.8, // Slightly higher for natural variation
			system: systemWithCache,
			messages: [{ role: 'user', content: userMessage }]
		});

		// Extract the comment text
		const content = response.content[0];
		if (content?.type !== 'text') {
			return { success: false, message: 'Unexpected response format from Opus' };
		}

		const comment = content.text.trim();
		log.info('Comment generated', { length: comment.length });

		return {
			success: true,
			message: 'Comment generated',
			comment
		};
	} catch (error) {
		log.error('Failed to generate comment', { error });
		return {
			success: false,
			message: `Failed to generate comment: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

// ============================================================================
// Exports
// ============================================================================

export const ENGAGEMENT_TOOLS: Anthropic.Tool[] = [
	GET_SUBREDDIT_REGISTRY_TOOL,
	DRAFT_COMMENT_TOOL,
	LOG_ENGAGEMENT_TOOL
];

export function isEngagementTool(toolName: string): boolean {
	return ['get_subreddit_registry', 'draft_comment', 'log_engagement'].includes(toolName);
}

export type EngagementToolResult = SubredditRegistryResult | DraftCommentResult | LogEngagementResult;

/**
 * Context for engagement tool execution
 */
export interface EngagementToolContext {
	commentGeneratorModel?: string; // Required for draft_comment
}

export async function executeEngagementTool(
	toolName: string,
	input: Record<string, unknown>,
	context?: EngagementToolContext
): Promise<EngagementToolResult> {
	switch (toolName) {
		case 'get_subreddit_registry':
			return executeGetSubredditRegistry(input);
		case 'draft_comment':
			if (!context?.commentGeneratorModel) {
				return { success: false, message: 'Missing commentGeneratorModel in context' };
			}
			return executeDraftComment(input, context.commentGeneratorModel);
		case 'log_engagement':
			return executeLogEngagement(input);
		default:
			return { success: false, message: `Unknown engagement tool: ${toolName}` };
	}
}
