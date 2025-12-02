/**
 * Chat API Endpoint
 *
 * Streams AI responses for conversation turns.
 * Saves to superjournal and triggers background compression.
 */

import type { RequestHandler } from './$types';
import { buildContext } from '$lib/context-builder';
import { DEFAULT_CONVERSATION_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { DEFAULT_PERSONA } from '$lib/config/personas';
import { getPersonaPrompt } from '$lib/prompts';
import {
	converseStream,
	saveToSuperjournal,
	triggerBackgroundJobs,
	getProviderType,
	assertProviderSupported,
	type ChartImageData
} from '$lib/calls';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// Service role client for storage operations
const supabaseStorage = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

		// 3. Parse and validate request first (need mode for settings)
		const parseResult = await parseRequestJson<unknown>(request);
		if (!parseResult.success) return parseResult.error;

		const validation = validateSchema(chatMessageSchema, parseResult.data);
		if (!validation.success) return validation.error;

		const { message, persona: requestPersona, chart_id, chart_source, mode = 'chat', content_id } = validation.data;

		// 4. Load user settings
		const { data: settings } = await supabase
			.from('user_settings')
			.select('selected_conversation_model, selected_reader_model, selected_persona')
			.eq('user_id', userId)
			.single();

		// Select model based on mode
		const conversationModel = mode === 'reader'
			? (settings?.selected_reader_model || DEFAULT_CONVERSATION_MODEL)
			: (settings?.selected_conversation_model || DEFAULT_CONVERSATION_MODEL);
		const selectedPersona = settings?.selected_persona || DEFAULT_PERSONA;
		const persona = requestPersona || selectedPersona;

		// 5. Fetch chart image if referenced
		let chartImage: ChartImageData | null = null;
		if (chart_id && chart_source) {
			try {
				// All charts now in unified charts table; bucket depends on source
				const bucket = chart_source === 'file' ? 'files' : 'articles';

				const { data: chartData, error: chartError } = await supabase
					.from('charts')
					.select('storage_path')
					.eq('id', chart_id)
					.eq('user_id', userId)
					.single();

				if (!chartError && chartData?.storage_path) {
					log.debug('Fetching chart image', { storagePath: chartData.storage_path, source: chart_source });

					// Download image from Supabase storage
					const { data: imageBlob, error: downloadError } = await supabaseStorage.storage
						.from(bucket)
						.download(chartData.storage_path);

					if (!downloadError && imageBlob) {
						const arrayBuffer = await imageBlob.arrayBuffer();
						const base64 = Buffer.from(arrayBuffer).toString('base64');

						// Detect media type from storage path
						const ext = chartData.storage_path.split('.').pop()?.toLowerCase();
						let mediaType: ChartImageData['mediaType'] = 'image/jpeg';
						if (ext === 'png') mediaType = 'image/png';
						else if (ext === 'gif') mediaType = 'image/gif';
						else if (ext === 'webp') mediaType = 'image/webp';
						else if (ext === 'svg') mediaType = 'image/png'; // SVG will be handled specially

						chartImage = { base64, mediaType };
						log.debug('Chart image loaded', { sizeBytes: base64.length });
					} else {
						log.warn('Failed to download chart image', { error: downloadError?.message });
					}
				} else {
					log.debug('Chart not found', { chartId: chart_id, source: chart_source });
				}
			} catch (err) {
				log.warn('Error fetching chart', { error: err instanceof Error ? err.message : 'Unknown' });
			}
		}

		// 6. Validate provider support
		const conversationProvider = getProviderType(conversationModel);
		assertProviderSupported(conversationProvider);

		// 6. Build context and get model params
		const conversationParams = await getModelParams(conversationModel, 'conversation');

		const { context, stats } = await buildContext(
			supabase,
			userId,
			persona,
			conversationModel,
			message,
			mode,
			content_id
		);

		log.info('Context built', { ...stats, model: conversationModel, persona });

		// 7. Select persona prompt
		const personaPrompt = getPersonaPrompt(persona);

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
						temperature: conversationParams.temperature,
						chartImage
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

					// Save to superjournal first to get the real ID
					const superjournalId = await saveToSuperjournal({
						userId,
						message,
						aiResponse,
						conversationModel,
						persona,
						mode,
						contentId: content_id
					});

					// Send completion event with real superjournal ID
					const doneData = JSON.stringify({
						type: 'done',
						timestamp: new Date().toISOString(),
						model_identifier: conversationModel,
						superjournal_id: superjournalId
					});
					controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
					controller.close();

					// Trigger background jobs after stream closes
					if (superjournalId) {
						triggerBackgroundJobs({
							superjournalId,
							userId,
							message,
							aiResponse,
							persona
						});
					}
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
