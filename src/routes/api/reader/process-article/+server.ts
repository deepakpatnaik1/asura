import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEFAULT_READER_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { describeStream } from '$lib/calls';

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
	const { user } = await safeGetSession();
	if (!user) {
		return json(
			{
				error: {
					message: 'Unauthorized - must be logged in',
					code: 'UNAUTHORIZED'
				}
			},
			{ status: 401 }
		);
	}
	const userId = user.id;

	// 2. PARSE REQUEST BODY
	const { article_id } = await request.json();

	if (!article_id || typeof article_id !== 'string') {
		return json(
			{
				error: {
					message: 'Missing or invalid article_id',
					code: 'INVALID_INPUT'
				}
			},
			{ status: 400 }
		);
	}

	console.log('[Process Article] User ID:', userId);
	console.log('[Process Article] Article ID:', article_id);

	// 3. FETCH ARTICLE FROM DATABASE (including raw_html)
	const { data: article, error: fetchError } = await supabase
		.from('articles')
		.select('id, title, raw_html, status')
		.eq('id', article_id)
		.eq('user_id', userId) // RLS check
		.single();

	if (fetchError || !article) {
		console.error('[Process Article] Failed to fetch article:', fetchError);
		return json(
			{
				error: {
					message: 'Article not found or access denied',
					code: 'NOT_FOUND',
					details: fetchError?.message
				}
			},
			{ status: 404 }
		);
	}

	// 4. VALIDATE ARTICLE HAS RAW HTML
	if (!article.raw_html) {
		console.error('[Process Article] Article missing raw_html');
		return json(
			{
				error: {
					message: 'Article has no HTML content',
					code: 'INVALID_STATE'
				}
			},
			{ status: 400 }
		);
	}

	// 5. GET USER'S SELECTED E-READER MODEL (OR DEFAULT)
	const { data: settings } = await supabase
		.from('user_settings')
		.select('selected_reader_model')
		.eq('user_id', userId)
		.single();

	const selectedModel = settings?.selected_reader_model || DEFAULT_READER_MODEL;
	console.log('[Process Article] Using model:', selectedModel);

	// 6. GET MODEL PARAMETERS
	const modelParams = await getModelParams(selectedModel, 'reader');
	console.log('[Process Article] Model params:', modelParams);

	// 7. CREATE STREAMING RESPONSE
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			try {
				console.log('[Process Article] Starting AI call...');

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

				console.log('[Process Article] Full response length:', fullResponse.length);
				console.log('[Process Article] Preview snippet:', previewSnippet);
			console.log('[Process Article] Raw content (first 2000 chars):', JSON.stringify(fullResponse.slice(0, 2000)));

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
					console.error('[Process Article] Failed to save results:', updateError);
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({ error: 'Failed to save results to database' })}\n\n`
						)
					);
				} else {
					console.log('[Process Article] Successfully saved results to database');
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
				}

				controller.close();
			} catch (error) {
				console.error('[Process Article] Error during processing:', error);

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
