/**
 * Chat Converse Call
 *
 * Handles the main conversation streaming with a persona.
 * Takes prepared inputs, returns async generator of chunks.
 * Supports Brave Search tool use for web lookups.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { CALL1_PROMPT } from '$lib/prompts';
import { BRAVE_SEARCH_TOOL, executeBraveSearch } from '$lib/api/brave-search';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export interface ConverseParams {
	personaPrompt: string;
	context: string;
	message: string;
	model: string;
	maxTokens: number;
	temperature: number;
}

export interface ConverseResult {
	fullResponse: string;
	tokens: {
		input: number;
		output: number;
	};
}

/**
 * Stream a conversation response from a persona.
 * Handles Brave Search tool use when the AI decides to search.
 *
 * @param params - Conversation parameters
 * @yields Text chunks as they arrive
 * @returns Final response text and token counts
 */
export async function* converseStream(
	params: ConverseParams
): AsyncGenerator<string, ConverseResult, unknown> {
	const { personaPrompt, context, message, model, maxTokens, temperature } = params;

	// Build system prompt with cache breakpoints
	const systemPromptWithCache: Anthropic.Messages.TextBlockParam[] = [
		{
			type: 'text',
			text: personaPrompt,
			cache_control: { type: 'ephemeral' }
		},
		{
			type: 'text',
			text: CALL1_PROMPT,
			cache_control: { type: 'ephemeral' }
		}
	];

	// Build user prompt with context
	const fullUserPrompt =
		context.length > 0 ? `${context}--- CURRENT QUERY ---\n${message}` : message;

	// Initial messages
	const messages: Anthropic.MessageParam[] = [
		{
			role: 'user',
			content: fullUserPrompt
		}
	];

	let fullResponse = '';
	let totalInputTokens = 0;
	let totalOutputTokens = 0;

	// Recursive function to handle tool use
	async function* processWithTools(
		conversationMessages: Anthropic.MessageParam[]
	): AsyncGenerator<string, void, unknown> {
		const stream = await anthropic.messages.stream(
			{
				model,
				max_tokens: maxTokens,
				temperature,
				system: systemPromptWithCache,
				messages: conversationMessages,
				tools: [BRAVE_SEARCH_TOOL]
			},
			{
				headers: {
					'anthropic-beta': 'prompt-caching-2024-07-31'
				}
			}
		);

		// Stream text deltas
		for await (const event of stream) {
			if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
				const text = event.delta.text;
				fullResponse += text;
				yield text;
			}
		}

		// Get final message and accumulate tokens
		const finalMessage = await stream.finalMessage();
		totalInputTokens += finalMessage.usage.input_tokens;
		totalOutputTokens += finalMessage.usage.output_tokens;

		// Check for tool use
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

			// Recurse to continue after tool use
			yield* processWithTools(conversationMessages);
		}
	}

	yield* processWithTools(messages);

	return {
		fullResponse,
		tokens: {
			input: totalInputTokens,
			output: totalOutputTokens
		}
	};
}
