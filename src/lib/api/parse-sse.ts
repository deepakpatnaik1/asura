/**
 * Client-side SSE parser for streaming responses.
 * Works with the unified stream-protocol format.
 */

import type { StreamEvent } from './stream-protocol';

export interface ParsedStream {
	content: string;
	done: boolean;
	error?: string;
	metadata?: StreamEvent['metadata'];
}

/**
 * Parse SSE stream from a fetch Response.
 * Yields content strings as they arrive.
 */
export async function* parseSSE(response: Response): AsyncGenerator<string, ParsedStream> {
	const reader = response.body?.getReader();
	const decoder = new TextDecoder();

	if (!reader) {
		return { content: '', done: true, error: 'No response body' };
	}

	let fullContent = '';
	let metadata: StreamEvent['metadata'] | undefined;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value);
			const lines = chunk.split('\n');

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					try {
						const event = JSON.parse(line.slice(6)) as StreamEvent;

						if (event.type === 'chunk' && event.content) {
							fullContent += event.content;
							yield event.content;
						}

						if (event.type === 'done') {
							metadata = event.metadata;
							return { content: fullContent, done: true, metadata };
						}

						if (event.type === 'error') {
							return { content: fullContent, done: true, error: event.error };
						}
					} catch {
						// Skip malformed JSON lines
					}
				}
			}
		}
	} finally {
		reader.releaseLock();
	}

	return { content: fullContent, done: true, metadata };
}

/**
 * Simpler parser that collects all content and returns final result.
 * Use when you don't need to stream UI updates.
 */
export async function parseSSEComplete(response: Response): Promise<ParsedStream> {
	let result: ParsedStream = { content: '', done: false };

	for await (const chunk of parseSSE(response)) {
		result.content += chunk;
	}

	// Get the final return value
	const generator = parseSSE(response);
	let iterResult = await generator.next();
	while (!iterResult.done) {
		iterResult = await generator.next();
	}

	return iterResult.value || result;
}
