import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateHtmlSize, extractTitleFromHtml } from '$lib/capabilities';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. PARSE REQUEST BODY
	const parseResult = await parseRequestJson<{ html: string }>(request);
	if (!parseResult.success) return parseResult.error;
	const { html } = parseResult.data;

	if (!html || typeof html !== 'string') {
		return json(
			{
				error: {
					message: 'Missing or invalid HTML content',
					code: 'INVALID_INPUT'
				}
			},
			{ status: 400 }
		);
	}

	// 3. VALIDATE HTML SIZE (using file-reader capability)
	const validation = validateHtmlSize(html);
	if (!validation.valid) {
		return json(
			{
				error: {
					message: validation.error,
					code: 'INPUT_TOO_LARGE'
				}
			},
			{ status: 413 }
		);
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
		return json(
			{
				error: {
					message: 'Failed to create article record',
					code: 'DATABASE_ERROR',
					details: insertError?.message
				}
			},
			{ status: 500 }
		);
	}

	// 6. RETURN ARTICLE ID AND TITLE
	// Note: Client will send HTML + article_id to next endpoint for PDF conversion
	return json({
		success: true,
		article_id: article.id,
		title: title
	});
};
