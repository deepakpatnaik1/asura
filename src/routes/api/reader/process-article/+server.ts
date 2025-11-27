import type { RequestHandler } from './$types';
import { DEFAULT_READER_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { describeStream } from '$lib/calls';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { processArticleSchema, validateSchema } from '$lib/schemas';
import { notFoundError, errorResponse } from '$lib/api/errors';

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

				// 8. EXTRACT PREVIEW SNIPPET (first 100-150 chars)
				const previewLength = 150;
				const previewSnippet = fullResponse.substring(0, previewLength).trim();

				// 9. SAVE TO DATABASE
				const { error: updateError } = await supabase
					.from('articles')
					.update({
						transformed_content: fullResponse,
						preview_snippet: previewSnippet,
						status: 'ready'
					})
					.eq('id', article_id)
					.eq('user_id', userId);

				if (updateError) {
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({ error: 'Failed to save results to database' })}\n\n`
						)
					);
				} else {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
				}

				controller.close();
			} catch (error) {
				// Article remains in 'processing' status on error
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
