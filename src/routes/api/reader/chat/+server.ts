/**
 * Reader Chat Endpoint
 *
 * Handles Q&A follow-up on articles with conversation history.
 * Saves to superjournal with mode='reader' and content_id=article_id.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEFAULT_READER_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { followupStream } from '$lib/calls';
import { saveToSuperjournal, triggerBackgroundJobs } from '$lib/calls';
import { parseRequestJson } from '$lib/api/parse-json';
import { requireAuth } from '$lib/api/require-auth';
import { waitForRateLimit, RATE_LIMITS } from '$lib/api/rate-limit';
import { createLogger } from '$lib/api/logger';
import { readerChatSchema, validateSchema } from '$lib/schemas';
import { notFoundError, errorResponse } from '$lib/api/errors';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. RATE LIMIT
	await waitForRateLimit(userId, RATE_LIMITS.ai);

	// 3. PARSE AND VALIDATE REQUEST BODY
	const parseResult = await parseRequestJson<unknown>(request);
	if (!parseResult.success) return parseResult.error;

	const validation = validateSchema(readerChatSchema, parseResult.data);
	if (!validation.success) return validation.error;

	const { article_id, message, chart_index } = validation.data;

	const log = createLogger('ReaderChat', userId);
	log.info('Request received', { articleId: article_id, chartIndex: chart_index, messageLength: message.length });

	// 4. FETCH ARTICLE FROM DATABASE
	const { data: article, error: fetchError } = await supabase
		.from('articles')
		.select('id, title, raw_html')
		.eq('id', article_id)
		.eq('user_id', userId)
		.single();

	if (fetchError || !article) {
		log.error('Failed to fetch article', { error: fetchError?.message });
		return notFoundError('Article');
	}

	if (!article.raw_html) {
		log.error('Article missing raw_html', { articleId: article_id });
		return errorResponse('BAD_REQUEST', { message: 'Article has no content' });
	}

	// 5. FETCH CHART IMAGE IF REFERENCED
	let chartImageData: { base64: string; mediaType: string } | null = null;
	if (chart_index !== null && chart_index !== undefined && typeof chart_index === 'number') {
		const { data: chartData, error: chartError } = await supabase
			.from('article_charts')
			.select('storage_path, chart_index')
			.eq('article_id', article_id)
			.eq('user_id', userId)
			.eq('chart_index', chart_index + 1) // 0-based in frontend, 1-based in DB
			.single();

		if (!chartError && chartData?.storage_path) {
			log.debug('Fetching chart image', { storagePath: chartData.storage_path });

			const { data: imageBlob, error: downloadError } = await supabase.storage
				.from('articles')
				.download(chartData.storage_path);

			if (!downloadError && imageBlob) {
				const arrayBuffer = await imageBlob.arrayBuffer();
				const base64 = Buffer.from(arrayBuffer).toString('base64');

				const ext = chartData.storage_path.split('.').pop()?.toLowerCase();
				let mediaType = 'image/jpeg';
				if (ext === 'png') mediaType = 'image/png';
				else if (ext === 'gif') mediaType = 'image/gif';
				else if (ext === 'webp') mediaType = 'image/webp';

				chartImageData = { base64, mediaType };
				log.debug('Chart image loaded', { sizeBytes: base64.length });
			}
		}
	}

	// 6. FETCH CONVERSATION HISTORY FROM SUPERJOURNAL
	const { data: superjournalHistory, error: historyError } = await supabase
		.from('superjournal')
		.select('user_message, ai_response, created_at')
		.eq('content_id', article_id)
		.eq('user_id', userId)
		.eq('mode', 'reader')
		.order('created_at', { ascending: true });

	if (historyError) {
		log.warn('Failed to fetch chat history, continuing without', { error: historyError.message });
	}

	// Convert superjournal format to chat history format
	const chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
	if (superjournalHistory && superjournalHistory.length > 0) {
		for (const turn of superjournalHistory) {
			const timestamp = new Date(turn.created_at).toISOString();
			chatHistory.push({
				role: 'user',
				content: `[${timestamp}]\n${turn.user_message}`
			});
			chatHistory.push({
				role: 'assistant',
				content: turn.ai_response
			});
		}
	}

	// 7. GET USER'S SELECTED MODEL
	const { data: settings } = await supabase
		.from('user_settings')
		.select('selected_reader_model')
		.eq('user_id', userId)
		.single();

	const selectedModel = settings?.selected_reader_model || DEFAULT_READER_MODEL;
	log.info('Starting AI call', { model: selectedModel, historyLength: chatHistory.length });

	// 8. GET MODEL PARAMETERS
	const modelParams = await getModelParams(selectedModel, 'reader');

	// 9. CREATE STREAMING RESPONSE
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			try {
				log.debug('Starting stream');

				const generator = followupStream({
					articleTitle: article.title,
					articleHtml: article.raw_html,
					previousSummary: null,
					chatHistory,
					message,
					chartImage: chartImageData,
					chartIndex: chart_index ?? null,
					model: selectedModel,
					maxTokens: modelParams.max_tokens,
					temperature: modelParams.temperature
				});

				let fullResponse = '';
				while (true) {
					const { value, done } = await generator.next();
					if (done) {
						fullResponse = value;
						break;
					}
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: value })}\n\n`));
				}

				// 10. SAVE TO SUPERJOURNAL
				const superjournalId = await saveToSuperjournal({
					userId,
					message,
					aiResponse: fullResponse,
					conversationModel: selectedModel,
					persona: 'samara',
					mode: 'reader',
					contentId: article_id
				});

				if (!superjournalId) {
					log.error('Failed to save to superjournal');
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify({ error: 'Failed to save response' })}\n\n`)
					);
				} else {
					log.info('Response saved', { superjournalId });

					// Send done event with superjournal ID
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify({ done: true, superjournal_id: superjournalId })}\n\n`)
					);

					// Trigger background jobs (compression, table extraction)
					triggerBackgroundJobs({
						superjournalId,
						userId,
						message,
						aiResponse: fullResponse,
						persona: 'samara'
					});
				}

				controller.close();
			} catch (error) {
				log.error('Error during processing', { error: error instanceof Error ? error.message : 'Unknown' });
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`)
				);
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
};
