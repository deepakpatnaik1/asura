/**
 * Unified SSE streaming protocol for all API endpoints.
 * Both chat and reader modes use this same format.
 */

export interface StreamEvent {
	type: 'chunk' | 'done' | 'error';
	content?: string;
	error?: string;
	metadata?: {
		timestamp?: string;
		model_identifier?: string;
		token_usage?: {
			input: number;
			output: number;
		};
	};
}

/**
 * Emit a text chunk to the stream
 */
export function emitChunk(content: string): string {
	const event: StreamEvent = { type: 'chunk', content };
	return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Emit a completion event with optional metadata
 */
export function emitDone(metadata?: StreamEvent['metadata']): string {
	const event: StreamEvent = { type: 'done', metadata };
	return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Emit an error event
 */
export function emitError(error: string): string {
	const event: StreamEvent = { type: 'error', error };
	return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Create SSE response headers
 */
export function sseHeaders(): HeadersInit {
	return {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive'
	};
}
