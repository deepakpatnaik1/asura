/**
 * Channel: Reddit
 *
 * Fetches Reddit threads and parses them into structured format
 * for community engagement analysis.
 */

import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool Definition
 */
export const FETCH_REDDIT_THREAD_TOOL: Anthropic.Tool = {
	name: 'fetch_reddit_thread',
	description:
		'Fetch a Reddit thread and return structured data (post + comments). Use this when Boss shares a Reddit URL and wants to engage with the community.',
	input_schema: {
		type: 'object',
		properties: {
			url: {
				type: 'string',
				description: 'Reddit thread URL (e.g., https://www.reddit.com/r/replika/comments/abc123/title/)'
			}
		},
		required: ['url']
	}
};

/**
 * Fetch Subreddit Posts Tool
 * Gets hot/new posts from a subreddit for post discovery.
 */
export const FETCH_SUBREDDIT_POSTS_TOOL: Anthropic.Tool = {
	name: 'fetch_subreddit_posts',
	description:
		'Fetch posts from a subreddit with proven engagement. Use this for post discovery when Boss has selected a subreddit to engage with. Defaults to top posts from past week.',
	input_schema: {
		type: 'object',
		properties: {
			subreddit: {
				type: 'string',
				description: 'Subreddit name (e.g., "Replika" or "r/Replika")'
			},
			sort: {
				type: 'string',
				enum: ['hot', 'new', 'top'],
				description: 'Sort order (default: top)'
			},
			time: {
				type: 'string',
				enum: ['day', 'week', 'month'],
				description: 'Time filter for top sort (default: week). Only applies when sort=top.'
			},
			limit: {
				type: 'number',
				description: 'Number of posts to fetch (default: 10, max: 25)'
			}
		},
		required: ['subreddit']
	}
};

/**
 * All Reddit tools
 */
export const REDDIT_TOOLS: Anthropic.Tool[] = [FETCH_REDDIT_THREAD_TOOL, FETCH_SUBREDDIT_POSTS_TOOL];

/**
 * Parsed comment structure
 */
export interface RedditComment {
	id: string;
	author: string;
	time_ago: string;
	body: string;
	score: number;
	depth: number;
	parent_id?: string;
}

/**
 * Parsed post structure
 */
export interface RedditPost {
	title: string;
	author: string;
	time_ago: string;
	body: string;
	score: number;
	num_comments: number;
}

/**
 * Full thread response
 */
export interface RedditThread {
	subreddit: string;
	post: RedditPost;
	comments: RedditComment[];
}

/**
 * Post listing entry (for subreddit posts)
 */
export interface RedditPostListing {
	id: string;
	title: string;
	author: string;
	time_ago: string;
	score: number;
	num_comments: number;
	url: string;
	permalink: string;
	flair?: string;
}

/**
 * Subreddit posts response
 */
export interface RedditSubredditPosts {
	subreddit: string;
	posts: RedditPostListing[];
}

/**
 * Tool execution result
 */
export interface RedditToolResult {
	success: boolean;
	message: string;
	data?: RedditThread | RedditSubredditPosts;
}

/**
 * Convert Unix timestamp to relative time string
 */
function timeAgo(timestamp: number): string {
	const seconds = Math.floor(Date.now() / 1000 - timestamp);

	if (seconds < 60) return 'just now';
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
	if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
	if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w`;
	return `${Math.floor(seconds / 2592000)}mo`;
}

/**
 * Parse Reddit JSON comment tree recursively
 */
function parseComments(
	children: Array<{ kind: string; data: Record<string, unknown> }>,
	depth: number = 0,
	maxDepth: number = 3
): RedditComment[] {
	const comments: RedditComment[] = [];

	for (const child of children) {
		if (child.kind !== 't1') continue; // t1 = comment
		if (depth > maxDepth) continue;

		const data = child.data;
		const author = data.author as string;

		// Skip deleted/removed
		if (author === '[deleted]' || author === '[removed]') continue;

		comments.push({
			id: data.id as string,
			author,
			time_ago: timeAgo(data.created_utc as number),
			body: (data.body as string) || '',
			score: (data.score as number) || 0,
			depth,
			parent_id: depth > 0 ? (data.parent_id as string)?.replace('t1_', '') : undefined
		});

		// Parse replies recursively
		const replies = data.replies;
		if (replies && typeof replies === 'object' && 'data' in (replies as Record<string, unknown>)) {
			const replyData = (replies as { data: { children: Array<{ kind: string; data: Record<string, unknown> }> } }).data;
			if (replyData.children) {
				comments.push(...parseComments(replyData.children, depth + 1, maxDepth));
			}
		}
	}

	return comments;
}

/**
 * Execute fetch_reddit_thread tool
 */
export async function executeFetchRedditThread(
	input: Record<string, unknown>
): Promise<RedditToolResult> {
	const url = input.url as string;

	if (!url) {
		return { success: false, message: 'Missing URL parameter' };
	}

	// Validate Reddit URL
	const redditMatch = url.match(/reddit\.com\/r\/(\w+)\/comments\/(\w+)/);
	if (!redditMatch) {
		return { success: false, message: 'Invalid Reddit URL. Expected format: reddit.com/r/subreddit/comments/id/...' };
	}

	const subreddit = redditMatch[1];

	try {
		// Fetch JSON version of the thread
		const jsonUrl = url.replace(/\/?$/, '.json');
		const response = await fetch(jsonUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.5'
			}
		});

		if (!response.ok) {
			return { success: false, message: `Reddit API error: ${response.status} ${response.statusText}` };
		}

		const json = await response.json() as Array<{ data: { children: Array<{ kind: string; data: Record<string, unknown> }> } }>;

		// Reddit returns array: [post_listing, comments_listing]
		if (!Array.isArray(json) || json.length < 2) {
			return { success: false, message: 'Unexpected Reddit API response format' };
		}

		// Parse post (first item in first listing)
		const postData = json[0].data.children[0]?.data;
		if (!postData) {
			return { success: false, message: 'Could not parse post data' };
		}

		const post: RedditPost = {
			title: postData.title as string,
			author: postData.author as string,
			time_ago: timeAgo(postData.created_utc as number),
			body: (postData.selftext as string) || '',
			score: (postData.score as number) || 0,
			num_comments: (postData.num_comments as number) || 0
		};

		// Parse comments
		const commentChildren = json[1].data.children || [];
		const comments = parseComments(commentChildren);

		const thread: RedditThread = {
			subreddit,
			post,
			comments
		};

		return {
			success: true,
			message: `Fetched thread: "${post.title}" with ${comments.length} comments`,
			data: thread
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to fetch thread: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Execute fetch_subreddit_posts tool
 */
export async function executeFetchSubredditPosts(
	input: Record<string, unknown>
): Promise<RedditToolResult> {
	let subreddit = input.subreddit as string;
	const sort = (input.sort as string) || 'top';
	const time = (input.time as string) || 'week';
	const limit = Math.min((input.limit as number) || 10, 25);

	if (!subreddit) {
		return { success: false, message: 'Missing subreddit parameter' };
	}

	// Normalize subreddit name (remove r/ prefix if present)
	subreddit = subreddit.replace(/^r\//, '');

	try {
		// Add time filter for top sort
		const timeParam = sort === 'top' ? `&t=${time}` : '';
		const jsonUrl = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}${timeParam}`;
		const response = await fetch(jsonUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.5'
			}
		});

		if (!response.ok) {
			return { success: false, message: `Reddit API error: ${response.status} ${response.statusText}` };
		}

		const json = await response.json() as { data: { children: Array<{ kind: string; data: Record<string, unknown> }> } };

		if (!json.data?.children) {
			return { success: false, message: 'Unexpected Reddit API response format' };
		}

		const posts: RedditPostListing[] = json.data.children
			.filter((child) => child.kind === 't3') // t3 = link/post
			.map((child) => {
				const data = child.data;
				return {
					id: data.id as string,
					title: data.title as string,
					author: data.author as string,
					time_ago: timeAgo(data.created_utc as number),
					score: (data.score as number) || 0,
					num_comments: (data.num_comments as number) || 0,
					url: data.url as string,
					permalink: `https://www.reddit.com${data.permalink as string}`,
					flair: (data.link_flair_text as string) || undefined
				};
			})
			.sort((a, b) => b.num_comments - a.num_comments); // Sort by engagement (most comments first)

		const sortLabel = sort === 'top' ? `top (past ${time})` : sort;
		return {
			success: true,
			message: `Fetched ${posts.length} ${sortLabel} posts from r/${subreddit}`,
			data: { subreddit, posts }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to fetch subreddit: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Execute Reddit tool by name
 */
export async function executeRedditTool(
	toolName: string,
	input: Record<string, unknown>
): Promise<RedditToolResult> {
	switch (toolName) {
		case 'fetch_reddit_thread':
			return executeFetchRedditThread(input);
		case 'fetch_subreddit_posts':
			return executeFetchSubredditPosts(input);
		default:
			return { success: false, message: `Unknown Reddit tool: ${toolName}` };
	}
}

/**
 * Check if a tool name is a Reddit tool
 */
export function isRedditTool(toolName: string): boolean {
	return ['fetch_reddit_thread', 'fetch_subreddit_posts'].includes(toolName);
}
