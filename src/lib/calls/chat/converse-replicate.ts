/**
 * Replicate Chat Streaming
 *
 * Handles conversation streaming for Replicate models.
 * Replicate uses a different API pattern - predictions endpoint with polling or streaming.
 * Tool calling support is limited and model-dependent.
 */

import { REPLICATE_API_KEY } from '$env/static/private';
import { CONVERSE_PROMPT } from '$lib/prompts';
import { converseUserPrompt } from '$lib/prompts/templates';
import type { ConverseParams, ConverseResult } from './converse';

/** Replicate prediction response */
interface ReplicatePrediction {
	id: string;
	status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
	output?: string[];
	error?: string;
	metrics?: {
		predict_time?: number;
	};
}

/**
 * Stream a conversation response using Replicate API.
 *
 * Note: Replicate's streaming works differently - uses SSE on the prediction stream URL.
 * Tool calling is not standardized across Replicate models.
 *
 * @param params - Conversation parameters
 * @yields Text chunks as they arrive
 * @returns Final response text and token counts
 */
export async function* converseStreamReplicate(
	params: ConverseParams
): AsyncGenerator<string, ConverseResult, unknown> {
	const { personaPrompt, context, message, model, maxTokens, temperature, chartImage, tools } = params;

	// Build system prompt
	const systemPrompt = `${personaPrompt}\n\n${CONVERSE_PROMPT}`;

	// Build user prompt with context
	const fullUserPrompt = converseUserPrompt(context, message);

	// Note: Replicate vision support varies by model
	if (chartImage) {
		console.warn('[Replicate] Chart images not yet supported');
	}

	// Note: Tool calling is not standardized on Replicate
	if (tools && tools.length > 0) {
		console.warn('[Replicate] Tool calling not yet supported for Replicate models');
	}

	let fullResponse = '';

	// Create prediction with streaming enabled
	const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${REPLICATE_API_KEY}`,
			Prefer: 'wait' // Wait for result instead of polling
		},
		body: JSON.stringify({
			model,
			input: {
				prompt: fullUserPrompt,
				system_prompt: systemPrompt,
				max_tokens: maxTokens,
				temperature
			},
			stream: true
		})
	});

	if (!createResponse.ok) {
		const error = await createResponse.text();
		throw new Error(`Replicate API error: ${createResponse.status} - ${error}`);
	}

	// Check if streaming response
	const contentType = createResponse.headers.get('content-type');

	if (contentType?.includes('text/event-stream')) {
		// SSE streaming response
		if (!createResponse.body) {
			throw new Error('No response body from Replicate API');
		}

		const reader = createResponse.body.getReader();
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
					if (data === 'done' || !data.trim()) continue;

					try {
						// Replicate streams raw text tokens
						fullResponse += data;
						yield data;
					} catch {
						// Skip malformed data
					}
				}
			}
		}
	} else {
		// JSON response (prediction created, need to get stream URL)
		const prediction: ReplicatePrediction & { urls?: { stream?: string } } = await createResponse.json();

		if (prediction.urls?.stream) {
			// Fetch the stream URL
			const streamResponse = await fetch(prediction.urls.stream, {
				headers: {
					Accept: 'text/event-stream',
					Authorization: `Bearer ${REPLICATE_API_KEY}`
				}
			});

			if (!streamResponse.ok) {
				throw new Error(`Replicate stream error: ${streamResponse.status}`);
			}

			if (!streamResponse.body) {
				throw new Error('No stream body from Replicate');
			}

			const reader = streamResponse.body.getReader();
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
						if (data === 'done' || !data.trim()) continue;

						fullResponse += data;
						yield data;
					}
				}
			}
		} else if (prediction.output) {
			// Non-streaming response, output is array of strings
			const text = prediction.output.join('');
			fullResponse = text;
			yield text;
		} else if (prediction.error) {
			throw new Error(`Replicate prediction failed: ${prediction.error}`);
		}
	}

	return {
		fullResponse,
		tokens: {
			input: 0, // Replicate doesn't provide token counts in streaming
			output: 0
		}
	};
}
