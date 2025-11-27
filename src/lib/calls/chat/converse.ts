/**
 * Chat Converse Call
 *
 * Handles the main conversation streaming with a persona.
 * Takes prepared inputs, returns async generator of chunks.
 */

import { createMessageStream } from '$lib/api/anthropic-client';
import { CALL1_PROMPT } from '$lib/prompts';

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
	const systemPromptWithCache = [
		{
			type: 'text' as const,
			text: personaPrompt,
			cache_control: { type: 'ephemeral' as const }
		},
		{
			type: 'text' as const,
			text: CALL1_PROMPT,
			cache_control: { type: 'ephemeral' as const }
		}
	];

	// Build user prompt with context
	const fullUserPrompt =
		context.length > 0 ? `${context}--- CURRENT QUERY ---\n${message}` : message;

	// Start streaming
	const stream = await createMessageStream({
		model,
		max_tokens: maxTokens,
		temperature,
		system: systemPromptWithCache,
		messages: [
			{
				role: 'user',
				content: fullUserPrompt
			}
		]
	});

	let fullResponse = '';

	// Yield chunks as they arrive
	for await (const event of stream) {
		if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
			const chunk = event.delta.text;
			fullResponse += chunk;
			yield chunk;
		}
	}

	// Get final token counts
	const finalMessage = await stream.finalMessage();
	const tokens = {
		input: finalMessage.usage.input_tokens,
		output: finalMessage.usage.output_tokens
	};

	return {
		fullResponse,
		tokens
	};
}
