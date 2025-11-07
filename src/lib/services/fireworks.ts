import { FIREWORKS_API_KEY } from '$env/static/private';

const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1';
const MODEL_ID = 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507';

export interface FireworksMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface FireworksResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: Array<{
		index: number;
		message: {
			role: string;
			content: string;
		};
		finish_reason: string;
	}>;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

/**
 * Call Fireworks AI with streaming disabled
 * Used for Call 1A and Call 2 (Artisan Cut)
 */
export async function callFireworks(
	messages: FireworksMessage[],
	temperature: number = 0.7,
	maxTokens: number = 4096
): Promise<string> {
	const response = await fetch(`${FIREWORKS_BASE_URL}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${FIREWORKS_API_KEY}`
		},
		body: JSON.stringify({
			model: MODEL_ID,
			messages,
			temperature,
			max_tokens: maxTokens,
			stream: false
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Fireworks API error: ${response.status} - ${error}`);
	}

	const data: FireworksResponse = await response.json();
	return data.choices[0].message.content;
}

/**
 * Call Fireworks AI with streaming enabled
 * Used for Call 1B (user-visible response)
 */
export async function callFireworksStreaming(
	messages: FireworksMessage[],
	temperature: number = 0.7,
	maxTokens: number = 4096
): Promise<ReadableStream<Uint8Array>> {
	const response = await fetch(`${FIREWORKS_BASE_URL}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${FIREWORKS_API_KEY}`
		},
		body: JSON.stringify({
			model: MODEL_ID,
			messages,
			temperature,
			max_tokens: maxTokens,
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

	return response.body;
}

/**
 * Parse SSE stream from Fireworks AI
 */
export async function* parseFireworksStream(
	stream: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, unknown> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = line.slice(6);
					if (data === '[DONE]') return;

					try {
						const parsed = JSON.parse(data);
						const content = parsed.choices[0]?.delta?.content;
						if (content) {
							yield content;
						}
					} catch (e) {
						console.error('Error parsing SSE data:', e);
					}
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}
