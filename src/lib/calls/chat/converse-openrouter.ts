/**
 * OpenRouter Chat Streaming
 *
 * Handles conversation streaming for OpenRouter models (OpenAI-compatible API).
 * Supports tool/function calling with recursive execution.
 */

import { OPENROUTER_API_KEY } from '$env/static/private';
import { CONVERSE_PROMPT } from '$lib/prompts';
import { converseUserPrompt } from '$lib/prompts/templates';
import { MEMORY } from '$lib/config/memory';
import { BRAVE_SEARCH_TOOL, executeBraveSearch } from '$lib/api/brave-search';
import { convertToolsToOpenAI, type OpenAIToolCall } from './provider';
import type { ConverseParams, ConverseResult } from './converse';

/** OpenAI-compatible message format */
interface OpenAIMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | null;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
}

/** OpenAI-compatible streaming response */
interface OpenAIStreamChunk {
	choices?: Array<{
		delta?: {
			content?: string;
			tool_calls?: Array<{
				index: number;
				id?: string;
				type?: 'function';
				function?: {
					name?: string;
					arguments?: string;
				};
			}>;
		};
		finish_reason?: string | null;
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
	};
}

/**
 * Stream a conversation response using OpenRouter API.
 *
 * Supports tool/function calling with OpenAI-compatible format.
 * Handles recursive tool calls up to MEMORY.maxToolUseDepth.
 *
 * @param params - Conversation parameters
 * @yields Text chunks as they arrive
 * @returns Final response text and token counts
 */
export async function* converseStreamOpenRouter(
	params: ConverseParams
): AsyncGenerator<string, ConverseResult, unknown> {
	const { personaPrompt, context, message, model, maxTokens, temperature, chartImage, tools, toolExecutor } = params;

	// Build system prompt (no caching on OpenRouter)
	const systemPrompt = `${personaPrompt}\n\n${CONVERSE_PROMPT}`;

	// Build user prompt with context
	const fullUserPrompt = converseUserPrompt(context, message);

	// Note: OpenRouter vision support varies by model
	if (chartImage) {
		console.warn('[OpenRouter] Chart images not yet supported for OpenRouter models');
	}

	// Convert Anthropic tools to OpenAI format
	const anthropicTools = tools || [BRAVE_SEARCH_TOOL];
	const openaiTools = convertToolsToOpenAI(anthropicTools);

	// Initial messages
	const messages: OpenAIMessage[] = [
		{ role: 'system', content: systemPrompt },
		{ role: 'user', content: fullUserPrompt }
	];

	let fullResponse = '';
	let totalInputTokens = 0;
	let totalOutputTokens = 0;

	/**
	 * Process a single API call, handling streaming and tool calls
	 */
	async function* processWithTools(
		conversationMessages: OpenAIMessage[],
		depth: number = 0
	): AsyncGenerator<string, void, unknown> {
		// Prevent unbounded recursion
		if (depth >= MEMORY.maxToolUseDepth) {
			return;
		}

		// Try with tools first, but some models don't support them
		let response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${OPENROUTER_API_KEY}`,
				'HTTP-Referer': 'https://aether.vercel.app',
				'X-Title': 'Aether'
			},
			body: JSON.stringify({
				model,
				messages: conversationMessages,
				max_tokens: maxTokens,
				temperature,
				stream: true,
				tools: openaiTools.length > 0 ? openaiTools : undefined,
				tool_choice: openaiTools.length > 0 ? 'auto' : undefined
			})
		});

		// If model doesn't support tools, retry without them
		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[OpenRouter] API error for model ${model}: ${response.status} - ${errorText}`);
			if (errorText.includes('No endpoints found that support tool use')) {
				console.warn(`[OpenRouter] Model ${model} does not support tools, retrying without`);
				response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${OPENROUTER_API_KEY}`,
						'HTTP-Referer': 'https://aether.vercel.app',
						'X-Title': 'Aether'
					},
					body: JSON.stringify({
						model,
						messages: conversationMessages,
						max_tokens: maxTokens,
						temperature,
						stream: true
						// No tools - model doesn't support them
					})
				});
				if (!response.ok) {
					const retryError = await response.text();
					throw new Error(`OpenRouter API error: ${response.status} - ${retryError}`);
				}
			} else {
				throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
			}
		}

		if (!response.body) {
			throw new Error('No response body from OpenRouter API');
		}

		// Parse SSE stream
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		// Accumulate tool calls across chunks
		const accumulatedToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
		let finishReason: string | null = null;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = line.slice(6);
					if (data === '[DONE]') continue;

					try {
						const parsed: OpenAIStreamChunk = JSON.parse(data);
						const choice = parsed.choices?.[0];

						if (choice) {
							// Handle text content
							const delta = choice.delta?.content;
							if (delta) {
								fullResponse += delta;
								yield delta;
							}

							// Handle tool calls (streamed incrementally)
							if (choice.delta?.tool_calls) {
								for (const toolCallDelta of choice.delta.tool_calls) {
									const index = toolCallDelta.index;
									if (!accumulatedToolCalls.has(index)) {
										accumulatedToolCalls.set(index, {
											id: toolCallDelta.id || `call_${index}`,
											name: '',
											arguments: ''
										});
									}
									const accumulated = accumulatedToolCalls.get(index)!;
									if (toolCallDelta.id) accumulated.id = toolCallDelta.id;
									if (toolCallDelta.function?.name) accumulated.name = toolCallDelta.function.name;
									if (toolCallDelta.function?.arguments) accumulated.arguments += toolCallDelta.function.arguments;
								}
							}

							// Capture finish reason
							if (choice.finish_reason) {
								finishReason = choice.finish_reason;
							}
						}

						// Capture usage if provided (typically in final chunk)
						if (parsed.usage) {
							totalInputTokens += parsed.usage.prompt_tokens || 0;
							totalOutputTokens += parsed.usage.completion_tokens || 0;
						}
					} catch {
						// Skip malformed JSON chunks
					}
				}
			}
		}

		// Check if we have tool calls to execute
		if (finishReason === 'tool_calls' && accumulatedToolCalls.size > 0) {
			// Build assistant message with tool calls
			const toolCallsArray: OpenAIToolCall[] = Array.from(accumulatedToolCalls.values()).map(tc => ({
				id: tc.id,
				type: 'function' as const,
				function: {
					name: tc.name,
					arguments: tc.arguments
				}
			}));

			// Add assistant message with tool calls
			conversationMessages.push({
				role: 'assistant',
				content: null,
				tool_calls: toolCallsArray
			});

			// Execute each tool and add results
			for (const toolCall of toolCallsArray) {
				// Emit tool call indicator to UI
				const toolIndicator = `\n⟨${toolCall.function.name}⟩\n`;
				fullResponse += toolIndicator;
				yield toolIndicator;

				let resultContent: string;

				try {
					const toolInput = JSON.parse(toolCall.function.arguments);

					// Use custom executor if provided, otherwise handle built-in tools
					if (toolExecutor) {
						const result = await toolExecutor(toolCall.function.name, toolInput);
						resultContent = result.success
							? `Success: ${result.message}${result.data ? `\nData: ${JSON.stringify(result.data)}` : ''}`
							: `Error: ${result.message}`;
					} else if (toolCall.function.name === 'brave_search') {
						const searchResults = await executeBraveSearch(toolInput.query);
						resultContent = searchResults || 'Search failed. Please continue without search results.';
					} else {
						resultContent = `Unknown tool: ${toolCall.function.name}`;
					}
				} catch (e) {
					resultContent = `Error parsing tool arguments: ${e instanceof Error ? e.message : 'Unknown error'}`;
				}

				// Add tool result message
				conversationMessages.push({
					role: 'tool',
					content: resultContent,
					tool_call_id: toolCall.id
				});
			}

			// Recurse to continue after tool use
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
