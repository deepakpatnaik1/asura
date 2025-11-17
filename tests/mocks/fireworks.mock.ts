/**
 * Fireworks AI Client Mock Factory
 *
 * Provides mock implementations of Fireworks AI (OpenAI-compatible) client for testing.
 * Use these mocks to avoid making real API calls during tests.
 */

import { vi } from 'vitest';

/**
 * Create a mock Fireworks AI (OpenAI) client
 */
export function createMockFireworksClient() {
	return {
		chat: {
			completions: {
				create: vi.fn().mockImplementation(async ({ messages, stream }) => {
					if (stream) {
						// Return a mock streaming response
						return createMockStreamingResponse();
					} else {
						// Return a mock non-streaming response
						return createMockChatCompletion();
					}
				})
			}
		}
	};
}

/**
 * Create a mock chat completion response
 */
export function createMockChatCompletion(content: string = 'Mock AI response') {
	return {
		id: 'chatcmpl-mock-id',
		object: 'chat.completion',
		created: Date.now(),
		model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
		choices: [
			{
				index: 0,
				message: {
					role: 'assistant',
					content
				},
				finish_reason: 'stop'
			}
		],
		usage: {
			prompt_tokens: 10,
			completion_tokens: 20,
			total_tokens: 30
		}
	};
}

/**
 * Create a mock streaming response
 */
export function createMockStreamingResponse() {
	// Create an async generator that simulates streaming
	const chunks = [
		{ content: 'Hello' },
		{ content: ' ' },
		{ content: 'world' },
		{ content: '!' }
	];

	let index = 0;

	return {
		async *[Symbol.asyncIterator]() {
			for (const chunk of chunks) {
				yield {
					id: 'chatcmpl-mock-id',
					object: 'chat.completion.chunk',
					created: Date.now(),
					model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
					choices: [
						{
							index: 0,
							delta: {
								content: chunk.content
							},
							finish_reason: null
						}
					]
				};
			}
			// Final chunk with finish_reason
			yield {
				id: 'chatcmpl-mock-id',
				object: 'chat.completion.chunk',
				created: Date.now(),
				model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
				choices: [
					{
						index: 0,
						delta: {},
						finish_reason: 'stop'
					}
				]
			};
		}
	};
}

/**
 * Create a mock Fireworks AI error
 */
export function createMockFireworksError(message: string, code?: string) {
	const error = new Error(message);
	(error as any).code = code || 'FIREWORKS_ERROR';
	(error as any).type = 'invalid_request_error';
	return error;
}

/**
 * Create a mock rate limit error
 */
export function createMockFireworksRateLimitError() {
	return createMockFireworksError(
		'Rate limit exceeded. Please try again later.',
		'rate_limit_exceeded'
	);
}

/**
 * Create a mock context length error
 */
export function createMockContextLengthError() {
	return createMockFireworksError(
		'This model\'s maximum context length is exceeded.',
		'context_length_exceeded'
	);
}
