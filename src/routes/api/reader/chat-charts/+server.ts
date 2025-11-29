import { json } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';

/**
 * Article Chat Charts Endpoint
 *
 * Fetches table charts extracted from Samara's Q&A responses.
 *
 * GET /api/reader/chat-charts?ids=id1,id2,id3
 * Response: { charts: { [articleChatId]: Array<{ id, thumbnail_url, full_url, alt }> } }
 */
export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. GET ARTICLE CHAT IDS FROM QUERY PARAMS
	const idsParam = url.searchParams.get('ids');

	if (!idsParam) {
		return json(
			{
				error: {
					message: 'Missing ids query parameter',
					code: 'INVALID_INPUT'
				}
			},
			{ status: 400 }
		);
	}

	const articleChatIds = idsParam.split(',').filter(Boolean);

	if (articleChatIds.length === 0) {
		return json({ charts: {} });
	}

	// 3. FETCH CHARTS FROM DATABASE
	const { data: charts, error: fetchError } = await supabase
		.from('article_chat_charts')
		.select('article_chat_id, chart_index, storage_path, thumbnail_path, alt_text')
		.in('article_chat_id', articleChatIds)
		.eq('user_id', userId)
		.order('chart_index', { ascending: true });

	if (fetchError) {
		return json(
			{
				error: {
					message: 'Failed to fetch charts',
					code: 'DATABASE_ERROR'
				}
			},
			{ status: 500 }
		);
	}

	// 4. GROUP BY ARTICLE CHAT ID AND TRANSFORM URLS
	const chartsByArticleChatId: Record<
		string,
		Array<{ id: string; thumbnail_url: string; full_url: string; alt: string }>
	> = {};

	for (const chart of charts || []) {
		const chatId = chart.article_chat_id;
		if (!chartsByArticleChatId[chatId]) {
			chartsByArticleChatId[chatId] = [];
		}
		chartsByArticleChatId[chatId].push({
			id: chart.chart_index.toString(),
			thumbnail_url: `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/articles/${chart.thumbnail_path}`,
			full_url: `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/articles/${chart.storage_path}`,
			alt: chart.alt_text || `Table ${chart.chart_index}`
		});
	}

	return json(
		{ charts: chartsByArticleChatId },
		{
			headers: {
				'Cache-Control': 'private, max-age=300'
			}
		}
	);
};
