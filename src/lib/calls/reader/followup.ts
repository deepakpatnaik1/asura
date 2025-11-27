/**
 * Reader Followup Call
 *
 * Handles Q&A follow-up on articles with conversation history.
 * Supports chart image references and web search.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { PERSONA_SAMARA } from '$lib/prompts';
import { followupArticleContext, followupChartPrefix } from '$lib/prompts/templates';
import { BRAVE_SEARCH_TOOL, executeBraveSearch } from '$lib/api/brave-search';
import { MEMORY } from '$lib/config/memory';
import { TIMING } from '$lib/config/timing';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export interface FollowupParams {
	articleTitle: string;
	articleHtml: string;
	previousSummary: string | null;
	chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
	message: string;
	chartImage: { base64: string; mediaType: string } | null;
	chartIndex: number | null;
	model: string;
	maxTokens: number;
	temperature: number;
}

/**
 * Stream a follow-up Q&A response from Samara.
 * Handles conversation history, chart references, and Brave Search.
 *
 * @param params - Followup parameters
 * @yields Text chunks as they arrive
 * @returns Final full response text
 */
export async function* followupStream(
	params: FollowupParams
): AsyncGenerator<string, string, unknown> {
	const {
		articleTitle,
		articleHtml,
		previousSummary,
		chatHistory,
		message,
		chartImage,
		chartIndex,
		model,
		maxTokens,
		temperature
	} = params;

	// Build conversation messages
	const messages: Anthropic.MessageParam[] = [];

	// First message: Article HTML + original summary
	const articleContext = followupArticleContext(articleTitle, articleHtml, previousSummary);
	messages.push({ role: 'user', content: articleContext });

	// Add conversation history
	for (const turn of chatHistory) {
		messages.push({
			role: turn.role,
			content: turn.content
		});
	}

	// Add current user question (with optional chart)
	const currentQuestionContent: Anthropic.ContentBlockParam[] = [];

	if (chartImage) {
		currentQuestionContent.push({
			type: 'image',
			source: {
				type: 'base64',
				media_type: chartImage.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
				data: chartImage.base64
			}
		});
		currentQuestionContent.push({
			type: 'text',
			text: followupChartPrefix(chartIndex ?? 0, message)
		});
	} else {
		currentQuestionContent.push({
			type: 'text',
			text: message
		});
	}

	messages.push({ role: 'user', content: currentQuestionContent });

	let fullResponse = '';

	// Recursive function to handle tool use (with depth limit)
	async function* processWithTools(
		conversationMessages: Anthropic.MessageParam[],
		depth: number = 0
	): AsyncGenerator<string, void, unknown> {
		// Prevent unbounded recursion
		if (depth >= MEMORY.maxToolUseDepth) {
			return;
		}
		const stream = await anthropic.messages.stream({
			model,
			max_tokens: maxTokens,
			temperature,
			system: PERSONA_SAMARA,
			messages: conversationMessages,
			tools: [BRAVE_SEARCH_TOOL]
		}, {
			timeout: TIMING.streamingTimeout
		});

		// Stream text deltas
		for await (const event of stream) {
			if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
				const text = event.delta.text;
				fullResponse += text;
				yield text;
			}
		}

		// Check for tool use
		const finalMessage = await stream.finalMessage();
		const toolUseBlocks = finalMessage.content.filter(
			(block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
		);

		if (toolUseBlocks.length > 0) {
			const toolResults: Anthropic.MessageParam[] = [];

			for (const toolBlock of toolUseBlocks) {
				if (toolBlock.name === 'brave_search') {
					const searchQuery = (toolBlock.input as { query: string }).query;
					const searchResults = await executeBraveSearch(searchQuery);

					toolResults.push({
						role: 'user',
						content: [
							{
								type: 'tool_result',
								tool_use_id: toolBlock.id,
								content: searchResults || 'Search failed. Please continue without search results.'
							}
						]
					});
				}
			}

			// Add assistant's tool use + results to conversation
			conversationMessages.push({
				role: 'assistant',
				content: finalMessage.content
			});
			conversationMessages.push(...toolResults);

			// Recurse (increment depth)
			yield* processWithTools(conversationMessages, depth + 1);
		}
	}

	yield* processWithTools(messages);

	return fullResponse;
}
