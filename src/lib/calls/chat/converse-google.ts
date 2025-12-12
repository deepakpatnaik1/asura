/**
 * Google AI Chat Streaming
 *
 * Handles conversation streaming for Google Gemini models via AI Studio API.
 * Supports tool/function calling with recursive execution.
 */

import { GOOGLE_AI_API_KEY } from '$env/static/private';
import { CONVERSE_PROMPT } from '$lib/prompts';
import { converseUserPrompt } from '$lib/prompts/templates';
import { MEMORY } from '$lib/config/memory';
import { BRAVE_SEARCH_TOOL, executeBraveSearch } from '$lib/api/brave-search';
import type Anthropic from '@anthropic-ai/sdk';
import type { ConverseParams, ConverseResult } from './converse';

/** Google AI message format */
interface GoogleMessage {
	role: 'user' | 'model';
	parts: Array<{ text: string } | { functionCall: { name: string; args: Record<string, unknown> } } | { functionResponse: { name: string; response: { result: string } } }>;
}

/** Google AI tool declaration */
interface GoogleTool {
	functionDeclarations: Array<{
		name: string;
		description: string;
		parameters: {
			type: string;
			properties: Record<string, unknown>;
			required?: string[];
		};
	}>;
}

/** Google AI streaming response */
interface GoogleStreamChunk {
	candidates?: Array<{
		content?: {
			parts?: Array<{
				text?: string;
				functionCall?: {
					name: string;
					args: Record<string, unknown>;
				};
			}>;
		};
		finishReason?: string;
	}>;
	usageMetadata?: {
		promptTokenCount?: number;
		candidatesTokenCount?: number;
	};
}

/**
 * Convert Anthropic tool schema to Google format.
 */
function convertToolToGoogle(anthropicTool: Anthropic.Tool): GoogleTool['functionDeclarations'][0] {
	return {
		name: anthropicTool.name,
		description: anthropicTool.description || '',
		parameters: {
			type: anthropicTool.input_schema.type as string,
			properties: (anthropicTool.input_schema.properties || {}) as Record<string, unknown>,
			required: anthropicTool.input_schema.required as string[] | undefined
		}
	};
}

/**
 * Stream a conversation response using Google AI Studio API.
 *
 * Supports tool/function calling with recursive execution.
 * Handles recursive tool calls up to MEMORY.maxToolUseDepth.
 *
 * @param params - Conversation parameters
 * @yields Text chunks as they arrive
 * @returns Final response text and token counts
 */
export async function* converseStreamGoogle(
	params: ConverseParams
): AsyncGenerator<string, ConverseResult, unknown> {
	const { personaPrompt, context, message, model, maxTokens, temperature, chartImage, tools, toolExecutor } = params;

	// Build system instruction
	const systemInstruction = `${personaPrompt}\n\n${CONVERSE_PROMPT}`;

	// Build user prompt with context
	const fullUserPrompt = converseUserPrompt(context, message);

	// Note: Google vision support requires different message format
	if (chartImage) {
		console.warn('[Google] Chart images not yet supported');
	}

	// Convert Anthropic tools to Google format
	const anthropicTools = tools || [BRAVE_SEARCH_TOOL];
	const googleTools: GoogleTool = {
		functionDeclarations: anthropicTools.map(convertToolToGoogle)
	};

	// Initial messages (Google uses 'user' and 'model' roles)
	const messages: GoogleMessage[] = [
		{ role: 'user', parts: [{ text: fullUserPrompt }] }
	];

	let fullResponse = '';
	let totalInputTokens = 0;
	let totalOutputTokens = 0;

	/**
	 * Process a single API call, handling streaming and tool calls
	 */
	async function* processWithTools(
		conversationMessages: GoogleMessage[],
		depth: number = 0
	): AsyncGenerator<string, void, unknown> {
		// Prevent unbounded recursion
		if (depth >= MEMORY.maxToolUseDepth) {
			return;
		}

		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${GOOGLE_AI_API_KEY}&alt=sse`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					systemInstruction: { parts: [{ text: systemInstruction }] },
					contents: conversationMessages,
					generationConfig: {
						maxOutputTokens: maxTokens,
						temperature
					},
					tools: [googleTools]
				})
			}
		);

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Google AI API error: ${response.status} - ${error}`);
		}

		if (!response.body) {
			throw new Error('No response body from Google AI API');
		}

		// Parse SSE stream
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		// Accumulate function calls
		const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
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
					if (data === '[DONE]' || !data.trim()) continue;

					try {
						const parsed: GoogleStreamChunk = JSON.parse(data);
						const candidate = parsed.candidates?.[0];

						if (candidate?.content?.parts) {
							for (const part of candidate.content.parts) {
								// Handle text content
								if (part.text) {
									fullResponse += part.text;
									yield part.text;
								}

								// Handle function calls
								if (part.functionCall) {
									functionCalls.push({
										name: part.functionCall.name,
										args: part.functionCall.args
									});
								}
							}
						}

						// Capture finish reason
						if (candidate?.finishReason) {
							finishReason = candidate.finishReason;
						}

						// Capture usage
						if (parsed.usageMetadata) {
							totalInputTokens = parsed.usageMetadata.promptTokenCount || 0;
							totalOutputTokens = parsed.usageMetadata.candidatesTokenCount || 0;
						}
					} catch {
						// Skip malformed JSON chunks
					}
				}
			}
		}

		// Check if we have function calls to execute
		if ((finishReason === 'STOP' || finishReason === 'FUNCTION_CALL') && functionCalls.length > 0) {
			// Add model message with function calls
			conversationMessages.push({
				role: 'model',
				parts: functionCalls.map(fc => ({ functionCall: { name: fc.name, args: fc.args } }))
			});

			// Execute each function and collect responses
			const functionResponses: GoogleMessage['parts'] = [];

			for (const fc of functionCalls) {
				// Emit tool call indicator to UI
				const toolIndicator = `\n⟨${fc.name}⟩\n`;
				fullResponse += toolIndicator;
				yield toolIndicator;

				let resultContent: string;

				try {
					// Use custom executor if provided, otherwise handle built-in tools
					if (toolExecutor) {
						const result = await toolExecutor(fc.name, fc.args);
						resultContent = result.success
							? `Success: ${result.message}${result.data ? `\nData: ${JSON.stringify(result.data)}` : ''}`
							: `Error: ${result.message}`;
					} else if (fc.name === 'brave_search') {
						const searchResults = await executeBraveSearch((fc.args as { query: string }).query);
						resultContent = searchResults || 'Search failed. Please continue without search results.';
					} else {
						resultContent = `Unknown tool: ${fc.name}`;
					}
				} catch (e) {
					resultContent = `Error executing tool: ${e instanceof Error ? e.message : 'Unknown error'}`;
				}

				functionResponses.push({
					functionResponse: {
						name: fc.name,
						response: { result: resultContent }
					}
				});
			}

			// Add user message with function responses
			conversationMessages.push({
				role: 'user',
				parts: functionResponses
			});

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
