/**
 * Fireworks Chat Streaming
 *
 * Handles conversation streaming for Fireworks models (OpenAI-compatible API).
 * Used for uncensored models like Hermes, Dolphin for Eva persona.
 */

import { FIREWORKS_API_KEY } from '$env/static/private';
import { CONVERSE_PROMPT } from '$lib/prompts';
import { converseUserPrompt } from '$lib/prompts/templates';
import { MEMORY } from '$lib/config/memory';
import { TIMING } from '$lib/config/timing';
import type { ConverseParams, ConverseResult, ToolExecutor } from './converse';

/**
 * Stream a conversation response using Fireworks API.
 *
 * Note: Fireworks uses OpenAI-compatible API format.
 * Tool use is simplified - no recursive tool calls for uncensored models.
 *
 * @param params - Conversation parameters
 * @yields Text chunks as they arrive
 * @returns Final response text and token counts
 */
export async function* converseStreamFireworks(
	params: ConverseParams
): AsyncGenerator<string, ConverseResult, unknown> {
	const { personaPrompt, context, message, model, maxTokens, temperature, chartImage } = params;

	// Build system prompt (no caching on Fireworks)
	const systemPrompt = `${personaPrompt}\n\n${CONVERSE_PROMPT}`;

	// Build user prompt with context
	const fullUserPrompt = converseUserPrompt(context, message);

	// Build messages array (OpenAI format)
	const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
		{ role: 'system', content: systemPrompt },
		{ role: 'user', content: fullUserPrompt }
	];

	// Note: Fireworks vision support varies by model
	// For now, we skip chart images on Fireworks models
	if (chartImage) {
		console.warn('[Fireworks] Chart images not yet supported for Fireworks models');
	}

	let fullResponse = '';
	let totalInputTokens = 0;
	let totalOutputTokens = 0;

	const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${FIREWORKS_API_KEY}`,
			Accept: 'text/event-stream'
		},
		body: JSON.stringify({
			model,
			messages,
			max_tokens: maxTokens,
			temperature,
			stream: true
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Fireworks API error: ${response.status} - ${error}`);
	}

	if (!response.body) {
		throw new Error('No response body from Fireworks API');
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
					const parsed = JSON.parse(data);
					const delta = parsed.choices?.[0]?.delta?.content;
					if (delta) {
						fullResponse += delta;
						yield delta;
					}

					// Capture usage if provided (typically in final chunk)
					if (parsed.usage) {
						totalInputTokens = parsed.usage.prompt_tokens || 0;
						totalOutputTokens = parsed.usage.completion_tokens || 0;
					}
				} catch {
					// Skip malformed JSON chunks
				}
			}
		}
	}

	return {
		fullResponse,
		tokens: {
			input: totalInputTokens,
			output: totalOutputTokens
		}
	};
}
