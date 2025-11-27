/**
 * Reader Describe Call
 *
 * Generates initial article summary with optional web search.
 * Handles recursive tool use for Brave Search.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { PERSONA_SAMARA } from '$lib/prompts';
import { BRAVE_SEARCH_TOOL, executeBraveSearch } from '$lib/api/brave-search';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export interface DescribeParams {
	articleTitle: string;
	articleHtml: string;
	model: string;
	maxTokens: number;
	temperature: number;
}

/**
 * Stream an article description/summary from Samara.
 * Handles Brave Search tool use recursively.
 *
 * @param params - Description parameters
 * @yields Text chunks as they arrive
 * @returns Final full response text
 */
export async function* describeStream(
	params: DescribeParams
): AsyncGenerator<string, string, unknown> {
	const { articleTitle, articleHtml, model, maxTokens, temperature } = params;

	const messages: Anthropic.MessageParam[] = [
		{
			role: 'user',
			content: `Here is an article titled "${articleTitle}". Please provide an educational summary. Use the web search tool as needed to understand recent context.

<article>
${articleHtml}
</article>`
		}
	];

	let fullResponse = '';

	// Recursive function to handle tool use
	async function* processWithTools(
		conversationMessages: Anthropic.MessageParam[]
	): AsyncGenerator<string, void, unknown> {
		const stream = await anthropic.messages.stream({
			model,
			max_tokens: maxTokens,
			temperature,
			system: PERSONA_SAMARA,
			messages: conversationMessages,
			tools: [BRAVE_SEARCH_TOOL]
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

			// Recurse
			yield* processWithTools(conversationMessages);
		}
	}

	yield* processWithTools(messages);

	return fullResponse;
}
