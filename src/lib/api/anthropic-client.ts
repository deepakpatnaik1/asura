import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';

/**
 * Anthropic API Client Wrapper
 * Provides simplified interface for creating messages with Claude models
 */

const anthropic = new Anthropic({
	apiKey: ANTHROPIC_API_KEY
});

/**
 * Parameters for creating a message
 */
export interface CreateMessageParams {
	model: string;
	max_tokens: number;
	temperature: number;
	system: string | Anthropic.Messages.TextBlockParam[];
	messages: Array<{
		role: 'user' | 'assistant';
		content: string;
	}>;
}

/**
 * Create a message using Anthropic API
 *
 * @param params - Message creation parameters
 * @returns Promise<Anthropic.Message> - Anthropic message response
 *
 * @example
 * const response = await createMessage({
 *   model: 'claude-sonnet-4-5-20250929',
 *   max_tokens: 2048,
 *   temperature: 0.7,
 *   system: 'You are a helpful assistant',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
 */
export async function createMessage(params: CreateMessageParams): Promise<Anthropic.Message> {
	return await anthropic.messages.create({
		model: params.model,
		max_tokens: params.max_tokens,
		temperature: params.temperature,
		system: params.system,
		messages: params.messages
	}, {
		headers: {
			'anthropic-beta': 'prompt-caching-2024-07-31'
		}
	});
}

/**
 * Create a streaming message using Anthropic API
 *
 * @param params - Message creation parameters
 * @returns Promise<Stream<MessageStreamEvent>> - Anthropic streaming response
 *
 * @example
 * const stream = await createMessageStream({
 *   model: 'claude-sonnet-4-5-20250929',
 *   max_tokens: 2048,
 *   temperature: 0.7,
 *   system: 'You are a helpful assistant',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * for await (const event of stream) {
 *   if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
 *     process.stdout.write(event.delta.text);
 *   }
 * }
 */
export async function createMessageStream(params: CreateMessageParams) {
	return await anthropic.messages.stream({
		model: params.model,
		max_tokens: params.max_tokens,
		temperature: params.temperature,
		system: params.system,
		messages: params.messages
	}, {
		headers: {
			'anthropic-beta': 'prompt-caching-2024-07-31'
		}
	});
}
