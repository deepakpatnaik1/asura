import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

/**
 * Articles Management Endpoint
 *
 * GET: Fetch all articles for current user
 * DELETE: Delete an article and all related data
 *
 * GET /api/reader/articles
 * Response: { articles: Array<{ id, title, preview_snippet }> }
 *
 * DELETE /api/reader/articles
 * Body: { article_id: string }
 * Response: { success: true }
 */

export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
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

	console.log('[Articles] Fetching for user:', userId);

	// 2. FETCH ARTICLES FROM DATABASE
	const { data: articles, error: fetchError } = await supabase
		.from('articles')
		.select('id, title, preview_snippet, created_at')
		.eq('user_id', userId)
		.order('created_at', { ascending: false }); // Most recent first

	if (fetchError) {
		console.error('[Articles] Failed to fetch:', fetchError);
		return json(
			{
				error: {
					message: 'Failed to fetch articles',
					code: 'DATABASE_ERROR',
					details: fetchError.message
				}
			},
			{ status: 500 }
		);
	}

	console.log('[Articles] Found', articles?.length || 0, 'articles');

	return json({
		articles: articles || []
	});
};

export const DELETE: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
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

	console.log('[Articles] Deleting article:', article_id);

	// 3. DELETE ARTICLE (CASCADE WILL HANDLE RELATED DATA)
	// The database has ON DELETE CASCADE for:
	// - article_chat (Q&A history)
	// - article_charts (charts and thumbnails)
	const { error: deleteError } = await supabase
		.from('articles')
		.delete()
		.eq('id', article_id)
		.eq('user_id', userId); // RLS check

	if (deleteError) {
		console.error('[Articles] Failed to delete:', deleteError);
		return json(
			{
				error: {
					message: 'Failed to delete article',
					code: 'DATABASE_ERROR',
					details: deleteError.message
				}
			},
			{ status: 500 }
		);
	}

	console.log('[Articles] Successfully deleted article:', article_id);

	return json({
		success: true
	});
};
