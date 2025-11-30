import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEFAULT_READER_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { followupStream, runExtractReaderTablesJob } from '$lib/calls';
import { parseRequestJson } from '$lib/api/parse-json';
import { requireAuth } from '$lib/api/require-auth';
import { waitForRateLimit, RATE_LIMITS } from '$lib/api/rate-limit';
import { createLogger } from '$lib/api/logger';
import { readerChatSchema, validateSchema } from '$lib/schemas';
import { notFoundError, errorResponse, databaseError } from '$lib/api/errors';

/**
 * Reader Chat Endpoint (Phase 5 - Q&A System)
 *
 * Handles follow-up questions about articles with:
 * - Full conversation history (original summary + all Q&A turns)
 * - Chart reference support (include chart file ID if user has chart open)
 * - Brave Search tool availability
 * - Streaming responses
 *
 * POST /api/reader/chat
 * Body: { article_id: string, message: string, chart_index?: number | null }
 * Response: Server-Sent Events stream
 */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. RATE LIMIT (1 request per minute - waits silently if needed)
	await waitForRateLimit(userId, RATE_LIMITS.ai);

	// 3. PARSE AND VALIDATE REQUEST BODY
	const parseResult = await parseRequestJson<unknown>(request);
	if (!parseResult.success) return parseResult.error;

	const validation = validateSchema(readerChatSchema, parseResult.data);
	if (!validation.success) return validation.error;

	const { article_id, message, chart_index } = validation.data;

	const log = createLogger('ReaderChat', userId);
	log.info('Request received', { articleId: article_id, chartIndex: chart_index, messageLength: message.length });

	// 3. FETCH ARTICLE FROM DATABASE
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

	// 4. VALIDATE ARTICLE HAS RAW HTML
	if (!article.raw_html) {
		log.error('Article missing raw_html', { articleId: article_id });
		return errorResponse('BAD_REQUEST', { message: 'Article has no content' });
	}

	// 5. FETCH CHART IF REFERENCED
	let chartImageData: { base64: string; mediaType: string } | null = null;
	if (chart_index !== null && chart_index !== undefined && typeof chart_index === 'number') {
		const { data: chartData, error: chartError } = await supabase
			.from('article_charts')
			.select('storage_path, chart_index')
			.eq('article_id', article_id)
			.eq('user_id', userId)
			.eq('chart_index', chart_index + 1) // chart_index is 0-based in frontend, 1-based in DB
			.single();

		if (!chartError && chartData?.storage_path) {
			log.debug('Fetching chart image', { storagePath: chartData.storage_path });

			// Download image from Supabase storage
			const { data: imageBlob, error: downloadError } = await supabase.storage
				.from('articles')
				.download(chartData.storage_path);

			if (!downloadError && imageBlob) {
				// Convert blob to base64
				const arrayBuffer = await imageBlob.arrayBuffer();
				const base64 = Buffer.from(arrayBuffer).toString('base64');

				// Detect media type from storage path
				const ext = chartData.storage_path.split('.').pop()?.toLowerCase();
				let mediaType = 'image/jpeg';
				if (ext === 'png') mediaType = 'image/png';
				else if (ext === 'gif') mediaType = 'image/gif';
				else if (ext === 'webp') mediaType = 'image/webp';

				chartImageData = { base64, mediaType };
				log.debug('Chart image loaded', { sizeBytes: base64.length });
			} else {
				log.error('Failed to download chart image', { error: downloadError?.message });
			}
		} else {
			log.debug('Chart not found, proceeding without chart');
		}
	}

	// 6. FETCH CONVERSATION HISTORY
	const { data: chatHistory, error: historyError } = await supabase
		.from('article_chat')
		.select('role, content, created_at')
		.eq('article_id', article_id)
		.eq('user_id', userId)
		.order('created_at', { ascending: true });

	if (historyError) {
		log.warn('Failed to fetch chat history, continuing without', { error: historyError.message });
	}

	// 7. GET USER'S SELECTED E-READER MODEL (OR DEFAULT)
	const { data: settings } = await supabase
		.from('user_settings')
		.select('selected_reader_model')
		.eq('user_id', userId)
		.single();

	const selectedModel = settings?.selected_reader_model || DEFAULT_READER_MODEL;
	log.info('Starting AI call', { model: selectedModel, historyLength: chatHistory?.length ?? 0 });

	// 8. GET MODEL PARAMETERS
	const modelParams = await getModelParams(selectedModel, 'reader');

	// 9. SAVE USER MESSAGE TO DATABASE FIRST
	const { data: userMessageData, error: saveUserError } = await supabase
		.from('article_chat')
		.insert({
			article_id,
			user_id: userId,
			role: 'user',
			content: message
		})
		.select('id')
		.single();

	if (saveUserError) {
		log.error('Failed to save user message', { error: saveUserError.message });
		return databaseError('Failed to save message');
	}

	// 10. CREATE STREAMING RESPONSE
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			try {
				log.debug('Starting stream');

				// Build chat history for the call (with timestamps for temporal reasoning)
				const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
				if (chatHistory && chatHistory.length > 0) {
					for (const turn of chatHistory) {
						const timestamp = new Date(turn.created_at).toISOString();
						history.push({
							role: turn.role as 'user' | 'assistant',
							content: `[${timestamp}]\n${turn.content}`
						});
					}
				}

				// Use followupStream call
				const generator = followupStream({
					articleTitle: article.title,
					articleHtml: article.raw_html,
					previousSummary: null,
					chatHistory: history,
					message,
					chartImage: chartImageData,
					chartIndex: chart_index ?? null,
					model: selectedModel,
					maxTokens: modelParams.max_tokens,
					temperature: modelParams.temperature
				});

				let fullResponse = '';
				// Stream chunks to client
				while (true) {
					const { value, done } = await generator.next();
					if (done) {
						fullResponse = value;
						break;
					}
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: value })}\n\n`));
				}

				// 11. SAVE AI RESPONSE TO DATABASE
				const { data: assistantMessage, error: saveAssistantError } = await supabase
					.from('article_chat')
					.insert({
						article_id,
						user_id: userId,
						role: 'assistant',
						content: fullResponse
					})
					.select('id')
					.single();

				if (saveAssistantError) {
					log.error('Failed to save assistant response', { error: saveAssistantError.message });
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({ error: 'Failed to save response to database' })}\n\n`
						)
					);
				} else {
					const articleChatId = assistantMessage?.id;
					log.info('Response saved', { articleChatId });

					// Send done event with message ID for chart fetching
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({ done: true, article_chat_id: articleChatId })}\n\n`
						)
					);

					// Trigger background table extraction
					if (articleChatId) {
						setTimeout(() => {
							runExtractReaderTablesJob({
								articleChatId,
								userId,
								aiResponse: fullResponse
							});
						}, 0);
					}
				}

				controller.close();
			} catch (error) {
				log.error('Error during processing', { error: error instanceof Error ? error.message : 'Unknown' });

				controller.enqueue(
					encoder.encode(
						`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`
					)
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
