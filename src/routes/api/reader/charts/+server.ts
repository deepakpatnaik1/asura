import { json } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';

/**
 * Charts Endpoint
 *
 * Fetches all charts/thumbnails for a specific article
 *
 * GET /api/reader/charts?article_id={id}
 * Response: { charts: Array<{ id, thumbnail_url, full_url, alt }> }
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

	// 3. FETCH CHARTS FROM DATABASE (only relevant ones)
	const { data: charts, error: fetchError } = await supabase
		.from('article_charts')
		.select('chart_index, storage_path, thumbnail_path, alt_text')
		.eq('article_id', articleId)
		.eq('user_id', userId) // RLS check
		.eq('is_relevant', true) // Only show AI-filtered relevant charts
		.order('chart_index', { ascending: true });

	if (fetchError) {
		return json(
			{
				error: {
					message: 'Failed to fetch charts',
					code: 'DATABASE_ERROR',
					details: fetchError.message
				}
			},
			{ status: 500 }
		);
	}

	// Transform storage paths to public URLs (bucket name: articles)
	const transformedCharts = (charts || []).map((chart) => ({
		id: chart.chart_index.toString(),
		thumbnail_url: `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/articles/${chart.thumbnail_path}`,
		full_url: `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/articles/${chart.storage_path}`,
		alt: chart.alt_text || `Chart ${chart.chart_index}`
	}));

	return json({
		charts: transformedCharts
	}, {
		headers: {
			'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' // 1 min cache (captions may update)
		}
	});
};
