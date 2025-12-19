/**
 * Venice AI Chat Streaming
 *
 * Handles conversation streaming for Venice models (OpenAI-compatible API).
 * Venice is privacy-focused with uncensored models.
 */

import { VENICE_API_KEY } from '$env/static/private';
import { CONVERSE_PROMPT } from '$lib/prompts';
import { converseUserPrompt } from '$lib/prompts/templates';
import { MEMORY } from '$lib/config/memory';
import type { ConverseParams, ConverseResult } from './converse';

/** OpenAI-compatible message format */
interface OpenAIMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

/** OpenAI-compatible streaming response */
interface OpenAIStreamChunk {
	choices?: Array<{
		delta?: {
			content?: string;
		};
		finish_reason?: string | null;
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
	};
}

/**
 * Stream a conversation response using Venice API.
 *
 * Note: Venice models generally don't support tool calling,
 * so we don't include tool handling here.
 *
 * @param params - Conversation parameters
 * @yields Text chunks as they arrive
 * @returns Final response text and token counts
 */
export async function* converseStreamVenice(
	params: ConverseParams
): AsyncGenerator<string, ConverseResult, unknown> {
	const { personaPrompt, context, message, model, maxTokens, temperature, chartImage } = params;

	console.log(`[Venice] Starting stream for model: ${model}`);

	if (!VENICE_API_KEY) {
		throw new Error('VENICE_API_KEY not configured');
	}

	// Build system prompt
	const systemPrompt = `${personaPrompt}\n\n${CONVERSE_PROMPT}`;

	// Build user prompt with context
	const fullUserPrompt = converseUserPrompt(context, message);

	// Note: Venice vision support varies by model
	if (chartImage) {
		console.warn('[Venice] Chart images not yet supported for Venice models');
	}

	// Initial messages
	const messages: OpenAIMessage[] = [
		{ role: 'system', content: systemPrompt },
		{ role: 'user', content: fullUserPrompt }
	];

	let fullResponse = '';
	let totalInputTokens = 0;
	let totalOutputTokens = 0;

	/**
	 * Process a single API call with streaming
	 */
	async function* processStream(
		conversationMessages: OpenAIMessage[],
		depth: number = 0
	): AsyncGenerator<string, void, unknown> {
		// Prevent unbounded recursion (though Venice doesn't support tools)
		if (depth >= MEMORY.maxToolUseDepth) {
			return;
		}

		const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${VENICE_API_KEY}`
			},
			body: JSON.stringify({
				model,
				messages: conversationMessages,
				max_tokens: maxTokens,
				temperature,
				stream: true
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[Venice] API error for model ${model}: ${response.status} - ${errorText}`);
			throw new Error(`Venice API error: ${response.status} - ${errorText}`);
		}

		if (!response.body) {
			throw new Error('No response body from Venice API');
		}

		// Parse SSE stream
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

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

		console.log(`[Venice] Stream finished`);
	}

	yield* processStream(messages);

	return {
		fullResponse,
		tokens: {
			input: totalInputTokens,
			output: totalOutputTokens
		}
	};
}
