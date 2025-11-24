import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

/**
 * Chat History Endpoint
 *
 * Fetches all Q&A turns for a specific article.
 *
 * GET /api/reader/chat-history?article_id={id}
 * Response: { history: Array<{ role: string, content: string }> }
 */
export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
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

	console.log('[Chat History] Fetching for article:', articleId);

	// 3. FETCH CHAT HISTORY FROM DATABASE
	const { data: chatHistory, error: fetchError } = await supabase
		.from('article_chat')
		.select('role, content, created_at')
		.eq('article_id', articleId)
		.eq('user_id', userId) // RLS check
		.order('created_at', { ascending: true });

	if (fetchError) {
		console.error('[Chat History] Failed to fetch:', fetchError);
		return json(
			{
				error: {
					message: 'Failed to fetch chat history',
					code: 'DATABASE_ERROR',
					details: fetchError.message
				}
			},
			{ status: 500 }
		);
	}

	console.log('[Chat History] Found', chatHistory?.length || 0, 'turns');

	return json({
		history: chatHistory || []
	});
};
