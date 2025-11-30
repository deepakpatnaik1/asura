import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateHtmlSize, extractTitleFromHtml } from '$lib/capabilities';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { readerUploadSchema, validateSchema } from '$lib/schemas';
import { errorResponse, databaseError, internalError } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';
import { htmlToPlainText } from '$lib/capabilities/image-extraction';
import { extractAndSaveCharts } from '$lib/capabilities/content-extraction';
import { createMessage } from '$lib/api/anthropic-client';
import { DEFAULT_COMPRESSION_MODEL } from '$lib/config/models';
import { FILE_ARTISAN_CUT_PROMPT } from '$lib/prompts/file-artisan-cut';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const log = createLogger('ReaderUpload', userId);

	// 2. PARSE AND VALIDATE REQUEST BODY
	const parseResult = await parseRequestJson<unknown>(request);
	if (!parseResult.success) return parseResult.error;

	const validation = validateSchema(readerUploadSchema, parseResult.data);
	if (!validation.success) return validation.error;

	const { content, persistent } = validation.data;

	// 3. VALIDATE SIZE
	const sizeValidation = validateHtmlSize(content);
	if (!sizeValidation.valid) {
		return errorResponse('PAYLOAD_TOO_LARGE', { message: sizeValidation.error });
	}

	try {
		log.info('Processing reader upload', { contentLength: content.length, persistent });

		// Fetch user settings (compression model + persona for reader is 'samara')
		const { data: settings } = await supabase
			.from('user_settings')
			.select('selected_compression_model')
			.eq('user_id', userId)
			.single();

		const model = settings?.selected_compression_model || DEFAULT_COMPRESSION_MODEL;
		const persona = 'samara'; // Reader mode always uses Samara

		// Generate readable content (strip images/tables) - always needed for display
		const readableContent = await htmlToPlainText(content);

		// Extract title from HTML
		const title = await extractTitleFromHtml(content);

		let artisanCut: string | null = null;

		if (persistent) {
			// Persistent: Call AI to generate artisan cut
			const response = await createMessage({
				model,
				max_tokens: 2048,
				temperature: 0.3,
				system: FILE_ARTISAN_CUT_PROMPT,
				messages: [{ role: 'user', content }]
			});

			const textBlock = response.content.find((block) => block.type === 'text');
			if (textBlock && textBlock.type === 'text') {
				// Parse JSON response for description only (we already have title)
				try {
					let jsonText = textBlock.text.trim();
					const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
					if (jsonMatch) {
						jsonText = jsonMatch[1].trim();
					}
					const objectMatch = jsonText.match(/\{[\s\S]*\}/);
					if (objectMatch) {
						jsonText = objectMatch[0];
					}
					const parsed = JSON.parse(jsonText);
					artisanCut = parsed.description || null;
				} catch (e) {
					log.warn('Failed to parse AI response for artisan cut', { raw: textBlock.text });
				}
			}
		}

		// 4. CREATE CONTENT RECORD
		const { data: article, error: insertError } = await supabase
			.from('content')
			.insert({
				user_id: userId,
				mode: 'reader',
				title: title.slice(0, 255),
				raw_content: content,
				artisan_cut: artisanCut,
				is_enabled: true // Reader articles default to enabled
			})
			.select('id, title')
			.single();

		if (insertError || !article) {
			log.error('Failed to create article record', { error: insertError?.message });
			return databaseError('Failed to create article record');
		}

		// 5. CREATE SUPERJOURNAL ENTRY FOR DISPLAY
		const { data: sjEntry, error: sjError } = await supabase
			.from('superjournal')
			.insert({
				user_id: userId,
				mode: 'reader',
				content_id: article.id,
				persona_name: persona,
				user_message: `Boss uploaded ${article.title}`,
				ai_response: `<!--file:${article.id}-->\n${readableContent}`,
				model_identifier: 'file-upload'
			})
			.select('id')
			.single();

		if (sjError) {
			log.warn('Failed to create superjournal entry', { error: sjError.message });
		}

		// 6. Extract images and tables from content
		const { chartCount } = await extractAndSaveCharts({
			content,
			userId,
			contentId: article.id,
			storageBucket: 'articles',
			supabase,
			log,
			isReaderMode: true
		});

		// 7. Update active content to this article
		await supabase
			.from('user_settings')
			.update({ active_content_id: article.id })
			.eq('user_id', userId);

		log.info('Reader upload successful', {
			articleId: article.id,
			superjournalId: sjEntry?.id,
			chartCount,
			persistent
		});

		// 8. RETURN ARTICLE ID, TITLE, CONTENT, AND SUPERJOURNAL ID
		return json({
			success: true,
			article_id: article.id,
			title: article.title,
			content: readableContent,
			superjournal_id: sjEntry?.id,
			chart_count: chartCount
		});
	} catch (error) {
		log.error('Reader upload failed', {
			error: error instanceof Error ? error.message : 'Unknown'
		});
		return internalError('Failed to process article');
	}
};
