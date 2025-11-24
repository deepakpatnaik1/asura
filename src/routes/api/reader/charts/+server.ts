import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

/**
 * Charts Endpoint
 *
 * Fetches all charts/thumbnails for a specific article
 *
 * GET /api/reader/charts?article_id={id}
 * Response: { charts: Array<{ chart_index, thumbnail_url, full_url, alt_text }> }
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

	console.log('[Charts] Fetching for article:', articleId);

	// 3. FETCH CHARTS FROM DATABASE (only relevant ones)
	const { data: charts, error: fetchError } = await supabase
		.from('article_charts')
		.select('chart_index, thumbnail_url, full_url, alt_text')
		.eq('article_id', articleId)
		.eq('user_id', userId) // RLS check
		.eq('is_relevant', true) // Only show AI-filtered relevant charts
		.order('chart_index', { ascending: true });

	if (fetchError) {
		console.error('[Charts] Failed to fetch:', fetchError);
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

	console.log('[Charts] Found', charts?.length || 0, 'charts');

	// Transform to frontend format (0-based index, rename fields)
	const transformedCharts = (charts || []).map((chart) => ({
		id: chart.chart_index.toString(),
		thumbnail_url: chart.thumbnail_url,
		full_url: chart.full_url,
		alt: chart.alt_text || `Chart ${chart.chart_index}`
	}));

	return json({
		charts: transformedCharts
	});
};
