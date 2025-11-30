import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';

/**
 * Single Article Fetch Endpoint
 *
 * Fetches a single article's full details for display/switching
 *
 * GET /api/reader/article?article_id={id}
 * Response: { article: { id, title } }
 */
export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

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

	// 3. FETCH ARTICLE FROM DATABASE
	const { data: article, error: fetchError } = await supabase
		.from('content')
		.select('id, title')
		.eq('id', articleId)
		.eq('user_id', userId)
		.eq('mode', 'reader')
		.single();

	if (fetchError || !article) {
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

	return json({
		article
	});
};
