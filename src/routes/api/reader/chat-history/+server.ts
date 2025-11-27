import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';

/**
 * Chat History Endpoint
 *
 * Fetches all Q&A turns for a specific article.
 *
 * GET /api/reader/chat-history?article_id={id}
 * Response: { history: Array<{ role: string, content: string }> }
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

	// 3. FETCH CHAT HISTORY FROM DATABASE
	const { data: chatHistory, error: fetchError } = await supabase
		.from('article_chat')
		.select('role, content, created_at')
		.eq('article_id', articleId)
		.eq('user_id', userId) // RLS check
		.order('created_at', { ascending: true });

	if (fetchError) {
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

	return json({
		history: chatHistory || []
	});
};
