import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateHtmlSize, extractTitleFromHtml } from '$lib/capabilities';

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
	const { html } = await request.json();

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
