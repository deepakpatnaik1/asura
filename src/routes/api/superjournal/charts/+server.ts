import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';

/**
 * Superjournal Charts Endpoint
 *
 * Fetches all table charts for superjournal entries.
 *
 * GET /api/superjournal/charts?ids=id1,id2,id3
 * Response: { charts: { [superjournalId]: Array<{ id, thumbnail_url, full_url, alt }> } }
 */
export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. GET SUPERJOURNAL IDS FROM QUERY PARAMS
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

	const superjournalIds = idsParam.split(',').filter(Boolean);

	if (superjournalIds.length === 0) {
		return json({ charts: {} });
	}

	// 3. FETCH CHARTS FROM DATABASE (excluding dismissed)
	const { data: charts, error: fetchError } = await supabase
		.from('article_charts')
		.select('id, superjournal_id, chart_index, storage_path, thumbnail_path, alt_text, is_pinned')
		.in('superjournal_id', superjournalIds)
		.eq('user_id', userId)
		.eq('is_dismissed', false)
		.order('is_pinned', { ascending: false })
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

	// 4. GROUP BY SUPERJOURNAL ID AND TRANSFORM URLS
	const chartsBySuperjournalId: Record<
		string,
		Array<{ id: string; thumbnail_url: string; full_url: string; alt: string; is_pinned: boolean }>
	> = {};

	for (const chart of charts || []) {
		const sjId = chart.superjournal_id;
		if (!chartsBySuperjournalId[sjId]) {
			chartsBySuperjournalId[sjId] = [];
		}
		chartsBySuperjournalId[sjId].push({
			id: chart.id,
			thumbnail_url: `/storage/v1/object/public/content/${chart.thumbnail_path}`,
			full_url: `/storage/v1/object/public/content/${chart.storage_path}`,
			alt: chart.alt_text || `Table ${chart.chart_index}`,
			is_pinned: chart.is_pinned
		});
	}

	return json(
		{ charts: chartsBySuperjournalId },
		{
			headers: {
				'Cache-Control': 'private, max-age=300'
			}
		}
	);
};
