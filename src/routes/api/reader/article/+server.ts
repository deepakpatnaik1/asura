import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Single Article Fetch Endpoint
 *
 * Fetches a single article's full details for display/switching
 *
 * GET /api/reader/article?article_id={id}
 * Response: { article: { id, title, transformed_content } }
 */
export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
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

	// 2. GET ARTICLE ID FROM QUERY PARAMS
	const articleId = url.searchParams.get('article_id');

	if (!articleId) {
		return json(
			{
				error: {
					message: 'Missing article_id query parameter',
					code: 'INVALID_INPUT'
				}
			},
			{ status: 400 }
		);
	}

	console.log('[Article] Fetching:', articleId);

	// 3. FETCH ARTICLE FROM DATABASE
	const { data: article, error: fetchError } = await supabase
		.from('articles')
		.select('id, title, transformed_content')
		.eq('id', articleId)
		.eq('user_id', userId) // RLS check
		.single();

	if (fetchError || !article) {
		console.error('[Article] Failed to fetch:', fetchError);
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

	console.log('[Article] Successfully fetched:', article.title);

	return json({
		article
	});
};
