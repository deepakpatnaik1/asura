/**
 * Anthropic Client Mock
 *
 * Provides mock implementations for Anthropic API operations.
 */

import { vi } from 'vitest';

// Mock message response
export interface MockMessageResponse {
	id: string;
	type: 'message';
	role: 'assistant';
	content: Array<{ type: 'text'; text: string }>;
	model: string;
	stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
	stop_sequence: string | null;
	usage: {
		input_tokens: number;
		output_tokens: number;
	};
}

export function createMockMessageResponse(text: string = 'Mock AI response'): MockMessageResponse {
	return {
		id: 'msg_test_123',
		type: 'message',
		role: 'assistant',
		content: [{ type: 'text', text }],
		model: 'claude-sonnet-4-5-20250929',
		stop_reason: 'end_turn',
		stop_sequence: null,
		usage: {
			input_tokens: 100,
			output_tokens: 50
		}
	};
}

// Mock streaming events
export function* createMockStreamEvents(text: string = 'Mock streaming response') {
	yield {
		type: 'message_start',
		message: {
			id: 'msg_test_123',
			type: 'message',
			role: 'assistant',
			content: [],
			model: 'claude-sonnet-4-5-20250929',
			stop_reason: null,
			stop_sequence: null,
			usage: { input_tokens: 100, output_tokens: 0 }
		}
	};

	yield {
		type: 'content_block_start',
		index: 0,
		content_block: { type: 'text', text: '' }
	};

	// Stream text in chunks
	const chunks = text.match(/.{1,10}/g) || [text];
	for (const chunk of chunks) {
		yield {
			type: 'content_block_delta',
			index: 0,
			delta: { type: 'text_delta', text: chunk }
		};
	}

	yield {
		type: 'content_block_stop',
		index: 0
	};

	yield {
		type: 'message_delta',
		delta: { stop_reason: 'end_turn', stop_sequence: null },
		usage: { output_tokens: 50 }
	};

	yield {
		type: 'message_stop'
	};
}

// Mock file upload response
export interface MockFileUploadResponse {
	id: string;
	created_at: string;
	filename: string;
	purpose: string;
	size_bytes: number;
}

export function createMockFileUploadResponse(filename: string = 'test.pdf'): MockFileUploadResponse {
	return {
		id: 'file_test_123',
		created_at: new Date().toISOString(),
		filename,
		purpose: 'assistants',
		size_bytes: 1024
	};
}

// Mock Anthropic client
export function createMockAnthropicClient() {
	return {
		messages: {
			create: vi.fn().mockResolvedValue(createMockMessageResponse()),
			stream: vi.fn().mockReturnValue({
				[Symbol.asyncIterator]: () => {
					const events = createMockStreamEvents();
					return {
						async next() {
							const result = events.next();
							return { value: result.value, done: result.done ?? false };
						}
					};
				}
			})
		},
		beta: {
			files: {
				upload: vi.fn().mockResolvedValue(createMockFileUploadResponse())
			}
		}
	};
}

// Mock the Anthropic SDK module
export function mockAnthropicModule() {
	return vi.mock('@anthropic-ai/sdk', () => ({
		default: vi.fn().mockImplementation(() => createMockAnthropicClient())
	}));
}
