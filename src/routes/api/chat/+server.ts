/**
 * Chat API Endpoint
 *
 * Streams AI responses for conversation turns.
 * Saves to superjournal and triggers background compression.
 */

import type { RequestHandler } from './$types';
import { buildContextForCalls1A1B } from '$lib/context-builder';
import { DEFAULT_CONVERSATION_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { DEFAULT_PERSONA } from '$lib/config/personas';
import { PERSONA_GUNNAR, PERSONA_KIRBY } from '$lib/prompts';
import {
	converseStream,
	saveConversation,
	getProviderType,
	assertProviderSupported
} from '$lib/calls';
import { parseRequestJson } from '$lib/api/parse-json';
import { requireAuth } from '$lib/api/require-auth';
import { waitForRateLimit, RATE_LIMITS } from '$lib/api/rate-limit';
import { createLogger, createSimpleLogger } from '$lib/api/logger';
import { chatMessageSchema, validateSchema } from '$lib/schemas';
import { internalError } from '$lib/api/errors';

// Background logger (no request context)
const bgLog = createSimpleLogger('ChatAPI');

/**
 * Extract message content (everything outside <think> tags)
 */
function extractMessage(text: string): string {
	return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	try {
		// 1. AUTHENTICATION CHECK
		const auth = await requireAuth(safeGetSession);
		if (!auth.success) return auth.error;
		const { userId } = auth;

		const log = createLogger('ChatAPI', userId);

		// 2. RATE LIMIT (waits silently if needed)
		await waitForRateLimit(userId, RATE_LIMITS.ai);

		// 3. Load user settings
		const { data: settings } = await supabase
			.from('user_settings')
			.select('selected_conversation_model, selected_persona')
			.eq('user_id', userId)
			.single();

		const conversationModel = settings?.selected_conversation_model || DEFAULT_CONVERSATION_MODEL;
		const selectedPersona = settings?.selected_persona || DEFAULT_PERSONA;

		// 4. Parse and validate request
		const parseResult = await parseRequestJson<unknown>(request);
		if (!parseResult.success) return parseResult.error;

		const validation = validateSchema(chatMessageSchema, parseResult.data);
		if (!validation.success) return validation.error;

		const { message, persona = selectedPersona } = validation.data;

		// 5. Validate provider support
		const conversationProvider = getProviderType(conversationModel);
		assertProviderSupported(conversationProvider);

		// 6. Build context and get model params
		const conversationParams = await getModelParams(conversationModel, 'conversation');

		const { context, stats } = await buildContextForCalls1A1B(
			supabase,
			userId,
			persona,
			conversationModel,
			message
		);

		log.info('Context built', { ...stats, model: conversationModel, persona });

		// 7. Select persona prompt
		const personaPrompt = persona === 'kirby' ? PERSONA_KIRBY : PERSONA_GUNNAR;

		// 8. Stream response
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();

				try {
					const generator = converseStream({
						personaPrompt,
						context,
						message,
						model: conversationModel,
						maxTokens: conversationParams.max_tokens,
						temperature: conversationParams.temperature
					});

					let result;
					while (true) {
						const { value, done } = await generator.next();
						if (done) {
							result = value;
							break;
						}
						const data = JSON.stringify({ type: 'chunk', content: value });
						controller.enqueue(encoder.encode(`data: ${data}\n\n`));
					}

					const aiResponse = extractMessage(result.fullResponse);

					// Send completion event immediately
					const doneData = JSON.stringify({
						type: 'done',
						timestamp: new Date().toISOString(),
						model_identifier: conversationModel
					});
					controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
					controller.close();

					// Trigger background save after stream closes
					saveConversation({
						userId,
						message,
						aiResponse,
						conversationModel,
						persona
					});
				} catch (error) {
					log.error('Streaming error', {
						error: error instanceof Error ? error.message : 'Unknown'
					});
					const errorData = JSON.stringify({
						type: 'error',
						message: 'Failed to generate response'
					});
					controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
					controller.close();
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive'
			}
		});
	} catch (error) {
		bgLog.error('Chat API error', {
			error: error instanceof Error ? error.message : 'Unknown'
		});
		return internalError('Failed to generate response');
	}
};
