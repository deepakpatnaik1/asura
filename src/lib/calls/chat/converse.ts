/**
 * Chat Converse Call
 *
 * Handles the main conversation streaming with a persona.
 * Takes prepared inputs, returns async generator of chunks.
 * Supports configurable tool use (Brave Search, Calendar, etc).
 */

import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { CONVERSE_PROMPT } from '$lib/prompts';
import { converseUserPrompt } from '$lib/prompts/templates';
import { BRAVE_SEARCH_TOOL, executeBraveSearch } from '$lib/api/brave-search';
import { MEMORY } from '$lib/config/memory';
import { TIMING } from '$lib/config/timing';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export interface ChartImageData {
	base64: string;
	mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

/**
 * Generic tool executor function type
 */
export type ToolExecutor = (
	toolName: string,
	input: Record<string, unknown>
) => Promise<{ success: boolean; message: string; data?: unknown }>;

export interface ConverseParams {
	personaPrompt: string;
	context: string;
	message: string;
	model: string;
	maxTokens: number;
	temperature: number;
	chartImage?: ChartImageData | null;
	tools?: Anthropic.Tool[];
	toolExecutor?: ToolExecutor;
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
	const { personaPrompt, context, message, model, maxTokens, temperature, chartImage, tools, toolExecutor } = params;

	// Determine which tools to use - custom tools or default Brave Search
	const activeTools = tools || [BRAVE_SEARCH_TOOL];

	// Build system prompt with cache breakpoints (1-hour TTL for deep thinking sessions)
	const systemPromptWithCache: Anthropic.Messages.TextBlockParam[] = [
		{
			type: 'text',
			text: personaPrompt,
			cache_control: { type: 'ephemeral', ttl: '1h' }
		},
		{
			type: 'text',
			text: CONVERSE_PROMPT,
			cache_control: { type: 'ephemeral', ttl: '1h' }
		}
	];

	// Build user prompt with context
	const fullUserPrompt = converseUserPrompt(context, message);

	// Build user message content - include chart image if provided
	let userContent: Anthropic.MessageParam['content'];
	if (chartImage) {
		userContent = [
			{
				type: 'image',
				source: {
					type: 'base64',
					media_type: chartImage.mediaType,
					data: chartImage.base64
				}
			},
			{
				type: 'text',
				text: `[Referring to the image above]\n\n${fullUserPrompt}`
			}
		];
	} else {
		userContent = fullUserPrompt;
	}

	// Initial messages
	const messages: Anthropic.MessageParam[] = [
		{
			role: 'user',
			content: userContent
		}
	];

	let fullResponse = '';
	let totalInputTokens = 0;
	let totalOutputTokens = 0;

	// Recursive function to handle tool use (with depth limit)
	async function* processWithTools(
		conversationMessages: Anthropic.MessageParam[],
		depth: number = 0
	): AsyncGenerator<string, void, unknown> {
		// Prevent unbounded recursion
		if (depth >= MEMORY.maxToolUseDepth) {
			return;
		}
		const stream = await anthropic.messages.stream(
			{
				model,
				max_tokens: maxTokens,
				temperature,
				system: systemPromptWithCache,
				messages: conversationMessages,
				tools: activeTools
			},
			{
				headers: {
					'anthropic-beta': 'prompt-caching-2024-07-31,extended-cache-ttl-2025-04-11'
				},
				timeout: TIMING.streamingTimeout
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
				// Emit tool call indicator to UI
				const toolIndicator = `\n⟨${toolBlock.name}⟩\n`;
				fullResponse += toolIndicator;
				yield toolIndicator;

				let resultContent: string;

				// Use custom executor if provided, otherwise handle built-in tools
				if (toolExecutor) {
					const result = await toolExecutor(
						toolBlock.name,
						toolBlock.input as Record<string, unknown>
					);
					resultContent = result.success
						? `Success: ${result.message}${result.data ? `\nData: ${JSON.stringify(result.data)}` : ''}`
						: `Error: ${result.message}`;
				} else if (toolBlock.name === 'brave_search') {
					// Default Brave Search handling
					const searchQuery = (toolBlock.input as { query: string }).query;
					const searchResults = await executeBraveSearch(searchQuery);
					resultContent = searchResults || 'Search failed. Please continue without search results.';
				} else {
					resultContent = `Unknown tool: ${toolBlock.name}`;
				}

				toolResults.push({
					role: 'user',
					content: [
						{
							type: 'tool_result',
							tool_use_id: toolBlock.id,
							content: resultContent
						}
					]
				});
			}

			// Add assistant's tool use + results to conversation
			conversationMessages.push({
				role: 'assistant',
				content: finalMessage.content
			});
			conversationMessages.push(...toolResults);

			// Recurse to continue after tool use (increment depth)
			yield* processWithTools(conversationMessages, depth + 1);
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
