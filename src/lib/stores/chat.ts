import { writable } from 'svelte/store';
import { fetchWithTimeout } from '$lib/utils/fetch-with-retry';

interface Message {
	id: string;
	boss: string;
	ai: string;
	timestamp: string;
	model_identifier?: string;
	superjournal_id?: string;
}

// Mutations from tool calls (todos, diary entries, calendar events)
interface Mutations {
	// Todo mutations
	created_todos?: unknown[];
	completed_todos?: string[];
	reopened_todos?: string[];
	updated_todos?: unknown[];
	deleted_todos?: string[];
	created_tags?: string[];
	// Diary mutations
	diary_entries?: unknown[];
	updated_diary?: unknown[];
	deleted_diary?: string[];
	// Calendar mutations
	created_events?: string[];
	updated_events?: string[];
	deleted_events?: string[];
	// Settings mutations
	settings_changed?: boolean;
}

// Whiteboard mutations from Gunnar's whiteboard tools
interface WhiteboardMutations {
	created_whiteboards?: { id: string; title: string; created_at: string; updated_at: string }[];
	renamed_whiteboards?: { id: string; title: string }[];
	deleted_whiteboards?: string[];
	updated_whiteboards?: { id: string; state: unknown }[];
	opened_whiteboard?: string | null; // ID of whiteboard to open in UI
}

// Canvas mutations from Eva's designer canvas tools
interface CanvasMutations {
	created_canvases?: { id: string; title: string; created_at: string; updated_at: string }[];
	renamed_canvases?: { id: string; title: string }[];
	deleted_canvases?: string[];
	updated_canvases?: { id: string; state: unknown }[];
	opened_canvas?: string | null; // ID of canvas to open in UI
	closed_canvas?: string | null; // ID of canvas to close/deselect
}

// Block mutations from Felix's block tools (sections, notes, dividers)
interface BlockMutations {
	created_blocks?: { id: string; block_type: string; parent_id: string | null }[];
	updated_blocks?: { id: string }[];
	deleted_blocks?: string[];
	moved_blocks?: { id: string; new_parent_id: string | null; new_position: number }[];
}

export const currentMessage = writable<Message | null>(null);
export const isLoading = writable(false);
export const lastMutations = writable<Mutations | null>(null);
export const lastWhiteboardMutations = writable<WhiteboardMutations | null>(null);
export const lastCanvasMutations = writable<CanvasMutations | null>(null);
export const lastBlockMutations = writable<BlockMutations | null>(null);

// AbortController for canceling streaming requests
let currentAbortController: AbortController | null = null;

// Streaming timeout: 2 minutes (streaming can be slow)
const STREAMING_TIMEOUT_MS = 120000;

export async function sendMessage(
	userMessage: string,
	persona?: string,
	chartId?: string,
	chartSource?: 'file' | 'superjournal',
	_articleIds?: string[], // DEPRECATED: context builder now uses owner-based injection
	whiteboardIds?: string[], // selected whiteboards for Gunnar context
	canvasIds?: string[] // selected designer canvases for Eva context
): Promise<void> {
	// Create new abort controller for this request
	currentAbortController = new AbortController();
	const now = new Date();
	const timestamp = now.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});

	// Show boss card immediately
	currentMessage.set({
		id: crypto.randomUUID(),
		boss: userMessage,
		ai: '',
		timestamp
	});

	isLoading.set(true);

	try {
		// Build request body with optional chart reference
		const body: Record<string, unknown> = { message: userMessage, persona };
		if (chartId && chartSource) {
			body.chart_id = chartId;
			body.chart_source = chartSource;
		}
		// Note: articleIds no longer passed - context builder uses owner-based injection
		if (whiteboardIds && whiteboardIds.length > 0) {
			body.whiteboard_ids = whiteboardIds;
		}
		if (canvasIds && canvasIds.length > 0) {
			body.canvas_ids = canvasIds;
		}

		const response = await fetchWithTimeout('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: currentAbortController.signal
		}, STREAMING_TIMEOUT_MS);

		if (!response.ok) {
			throw new Error('Failed to send message');
		}

		// Check if response is streaming (SSE) or JSON
		const contentType = response.headers.get('content-type');

		if (contentType?.includes('text/event-stream')) {
			// Handle SSE streaming response
			const reader = response.body?.getReader();
			const decoder = new TextDecoder();
			let streamedText = '';
			let buffer = ''; // Buffer for incomplete lines

			if (!reader) {
				throw new Error('No response body available');
			}

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					// Append to buffer and split into lines
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');

					// Keep last (potentially incomplete) line in buffer
					buffer = lines.pop() || '';

					for (const line of lines) {
						// Skip blank lines (SSE heartbeats)
						if (!line.trim()) continue;

						if (line.startsWith('data: ')) {
							try {
								const data = JSON.parse(line.slice(6));

								if (data.type === 'chunk') {
									// Append streaming chunk to AI response
									streamedText += data.content;
									currentMessage.update(msg => {
										if (msg) {
											return { ...msg, ai: streamedText };
										}
										return msg;
									});
								} else if (data.type === 'done') {
									// Stream complete - capture model, superjournal ID, and mutations
									currentMessage.update(msg => {
										if (msg) {
											return {
												...msg,
												model_identifier: data.model_identifier,
												superjournal_id: data.superjournal_id
											};
										}
										return msg;
									});
									// Capture mutations (diary entries, todos, etc.)
									if (data.mutations) {
										lastMutations.set(data.mutations);
									}
									// Capture whiteboard mutations
									if (data.whiteboard_mutations) {
										lastWhiteboardMutations.set(data.whiteboard_mutations);
									}
									// Capture canvas mutations
									if (data.canvas_mutations) {
										lastCanvasMutations.set(data.canvas_mutations);
									}
									// Capture block mutations (Felix's sections, notes, etc.)
									if (data.block_mutations) {
										lastBlockMutations.set(data.block_mutations);
									}
								} else if (data.type === 'error') {
									throw new Error(data.message);
								}
							} catch (parseError) {
								// Continue processing other lines
							}
						}
					}
				}
			} finally {
				// Always release reader lock, even on abort/error (fixes BUG-STREAM-005)
				reader.releaseLock();
			}

			// Always set loading to false when stream ends (fixes BUG-STREAM-006)
			isLoading.set(false);
		} else {
			// Fallback: Handle JSON response (backward compatibility)
			const data = await response.json();

			// Update with completed AI response
			currentMessage.set({
				id: crypto.randomUUID(),
				boss: userMessage,
				ai: data.message,
				timestamp,
				model_identifier: data.model_identifier
			});

			isLoading.set(false);
		}
	} catch (error) {
		// Check if error is from abort
		if (error instanceof Error && error.name === 'AbortError') {
			// Don't show error message for user-initiated abort
			// (isLoading already set to false in abortCurrentMessage())
			return;
		}

		// Don't clear the message - preserve UI state and show error
		currentMessage.update(msg => {
			if (msg) {
				return {
					...msg,
					ai: '❌ Failed to generate response. Please try again.'
				};
			}
			return msg;
		});

		isLoading.set(false);
	} finally {
		// Clean up abort controller
		currentAbortController = null;
	}
}

/**
 * Abort the current streaming message request
 * Only clears message if there's an active request (fixes BUG-STREAM-007)
 */
export function abortCurrentMessage() {
	if (currentAbortController) {
		currentAbortController.abort();
		currentAbortController = null;
		// Only clear message if we actually aborted an active request
		currentMessage.set(null);
		isLoading.set(false);
	}
	// Don't clear message if no active request (protects completed messages)
}
