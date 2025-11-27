import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateHtmlSize, extractTitleFromHtml } from '$lib/capabilities';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { readerUploadSchema, validateSchema } from '$lib/schemas';
import { errorResponse, databaseError } from '$lib/api/errors';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. PARSE AND VALIDATE REQUEST BODY
	const parseResult = await parseRequestJson<unknown>(request);
	if (!parseResult.success) return parseResult.error;

	const validation = validateSchema(readerUploadSchema, parseResult.data);
	if (!validation.success) return validation.error;

	const { html } = validation.data;

	// 3. VALIDATE HTML SIZE (using file-reader capability)
	const sizeValidation = validateHtmlSize(html);
	if (!sizeValidation.valid) {
		return errorResponse('PAYLOAD_TOO_LARGE', { message: sizeValidation.error });
	}

	// 4. EXTRACT ARTICLE TITLE (using file-reader capability)
	const title = extractTitleFromHtml(html);

	// 5. CREATE ARTICLE RECORD WITH STATUS = 'processing' AND RAW HTML
	const { data: article, error: insertError } = await supabase
		.from('articles')
		.insert({
			user_id: userId,
			title: title,
			status: 'processing',
			raw_html: html // Store raw HTML for direct AI processing (no PDF needed)
		})
		.select()
		.single();

	if (insertError || !article) {
		return databaseError('Failed to create article record');
	}

	// 6. RETURN ARTICLE ID AND TITLE
	// Note: Client will send HTML + article_id to next endpoint for PDF conversion
	return json({
		success: true,
		article_id: article.id,
		title: title
	});
};
