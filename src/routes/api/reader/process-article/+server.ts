import type { RequestHandler } from './$types';
import { DEFAULT_READER_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { describeStream } from '$lib/calls';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { processArticleSchema, validateSchema } from '$lib/schemas';
import { notFoundError, errorResponse } from '$lib/api/errors';
import { extractTablesFromSummary } from './extract-summary-tables';
import { updateChartCaptions } from './update-chart-captions';

/**
 * Process Article Endpoint (Phase 2, Group D - Chunks 6-8)
 *
 * Takes article_id, sends article PDF to AI with Brave Search tool,
 * streams response back, extracts preview, saves to database.
 *
 * POST /api/reader/process-article
 * Body: { article_id: string }
 * Response: Server-Sent Events stream
 */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. PARSE AND VALIDATE REQUEST BODY
	const parseResult = await parseRequestJson<unknown>(request);
	if (!parseResult.success) return parseResult.error;

	const validation = validateSchema(processArticleSchema, parseResult.data);
	if (!validation.success) return validation.error;

	const { article_id } = validation.data;

	// 3. FETCH ARTICLE FROM DATABASE (including raw_html)
	const { data: article, error: fetchError } = await supabase
		.from('articles')
		.select('id, title, raw_html, status')
		.eq('id', article_id)
		.eq('user_id', userId) // RLS check
		.single();

	if (fetchError || !article) {
		return notFoundError('Article');
	}

	// 4. VALIDATE ARTICLE HAS RAW HTML
	if (!article.raw_html) {
		return errorResponse('BAD_REQUEST', { message: 'Article has no HTML content' });
	}

	// 5. GET USER'S SELECTED E-READER MODEL (OR DEFAULT)
	const { data: settings } = await supabase
		.from('user_settings')
		.select('selected_reader_model')
		.eq('user_id', userId)
		.single();

	const selectedModel = settings?.selected_reader_model || DEFAULT_READER_MODEL;

	// 6. GET MODEL PARAMETERS
	const modelParams = await getModelParams(selectedModel, 'reader');

	// 6b. GET CHART COUNT FOR CAPTION GENERATION
	const { count: chartCount } = await supabase
		.from('article_charts')
		.select('*', { count: 'exact', head: true })
		.eq('article_id', article_id)
		.eq('user_id', userId);

	// 7. CREATE STREAMING RESPONSE
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			try {
				// Use describeStream call
				const generator = describeStream({
					articleTitle: article.title,
					articleHtml: article.raw_html,
					model: selectedModel,
					maxTokens: modelParams.max_tokens,
					temperature: modelParams.temperature,
					chartCount: chartCount || 0
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

				// 8. SIGNAL DONE
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));

				// 9. BACKGROUND JOBS (don't block response)
				setTimeout(() => {
					// Extract tables from AI summary
					extractTablesFromSummary({
						articleId: article_id,
						userId,
						aiResponse: fullResponse
					});

					// Update source chart captions from AI response
					if (chartCount && chartCount > 0) {
						updateChartCaptions({
							articleId: article_id,
							userId,
							aiResponse: fullResponse,
							chartCount
						});
					}
				}, 0);

				controller.close();
			} catch (error) {
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
