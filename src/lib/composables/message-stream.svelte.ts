/**
 * Message streaming composable.
 * Provides reactive state for streaming AI responses.
 *
 * Usage:
 *   const stream = createMessageStream();
 *   await stream.send('/api/chat', { message: 'Hello' });
 *   // Access: stream.isLoading, stream.content, stream.error
 */

import type { StreamEvent } from '$lib/api/stream-protocol';

export interface StreamingMessage {
	id: string;
	userMessage: string;
	aiResponse: string;
	timestamp: string;
	modelIdentifier?: string;
}

export interface MessageStreamState {
	readonly isLoading: boolean;
	readonly content: string;
	readonly error: string | null;
	readonly currentMessage: StreamingMessage | null;
	send: (endpoint: string, payload: Record<string, unknown>) => Promise<StreamingMessage | null>;
	abort: () => void;
	clear: () => void;
}

/**
 * Create a reactive message stream state.
 * Each mode can create its own instance.
 */
export function createMessageStream(): MessageStreamState {
	let isLoading = $state(false);
	let content = $state('');
	let error = $state<string | null>(null);
	let currentMessage = $state<StreamingMessage | null>(null);
	let abortController: AbortController | null = null;

	function formatTimestamp(): string {
		return new Date().toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	async function send(
		endpoint: string,
		payload: Record<string, unknown>
	): Promise<StreamingMessage | null> {
		// Create new abort controller
		abortController = new AbortController();

		// Reset state
		isLoading = true;
		content = '';
		error = null;

		// Create initial message
		const userMessage = (payload.message as string) || '';
		currentMessage = {
			id: crypto.randomUUID(),
			userMessage,
			aiResponse: '',
			timestamp: formatTimestamp()
		};

		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				signal: abortController.signal
			});

			if (!response.ok) {
				throw new Error('Request failed');
			}

			const contentType = response.headers.get('content-type');

			if (contentType?.includes('text/event-stream')) {
				// Handle SSE streaming
				const reader = response.body?.getReader();
				const decoder = new TextDecoder();
				let buffer = '';

				if (!reader) {
					throw new Error('No response body');
				}

				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split('\n');
						buffer = lines.pop() || '';

						for (const line of lines) {
							if (!line.trim()) continue;

							if (line.startsWith('data: ')) {
								try {
									const event = JSON.parse(line.slice(6)) as StreamEvent;

									if (event.type === 'chunk' && event.content) {
										content += event.content;
										if (currentMessage) {
											currentMessage = {
												...currentMessage,
												aiResponse: content
											};
										}
									}

									if (event.type === 'done') {
										if (currentMessage && event.metadata?.model_identifier) {
											currentMessage = {
												...currentMessage,
												modelIdentifier: event.metadata.model_identifier
											};
										}
									}

									if (event.type === 'error') {
										throw new Error(event.error || 'Stream error');
									}
								} catch (parseError) {
									// Skip malformed lines
									if (parseError instanceof SyntaxError) continue;
									throw parseError;
								}
							}
						}
					}
				} finally {
					reader.releaseLock();
				}
			} else {
				// Handle JSON response (fallback)
				const data = await response.json();
				content = data.message || data.text || '';
				if (currentMessage) {
					currentMessage = {
						...currentMessage,
						aiResponse: content,
						modelIdentifier: data.model_identifier
					};
				}
			}

			isLoading = false;
			return currentMessage;
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				// User-initiated abort
				isLoading = false;
				currentMessage = null;
				return null;
			}

			error = err instanceof Error ? err.message : 'Unknown error';
			isLoading = false;

			if (currentMessage) {
				currentMessage = {
					...currentMessage,
					aiResponse: `Error: ${error}`
				};
			}

			return currentMessage;
		} finally {
			abortController = null;
		}
	}

	function abort(): void {
		if (abortController) {
			abortController.abort();
			abortController = null;
			isLoading = false;
			currentMessage = null;
		}
	}

	function clear(): void {
		isLoading = false;
		content = '';
		error = null;
		currentMessage = null;
	}

	return {
		get isLoading() {
			return isLoading;
		},
		get content() {
			return content;
		},
		get error() {
			return error;
		},
		get currentMessage() {
			return currentMessage;
		},
		send,
		abort,
		clear
	};
}
