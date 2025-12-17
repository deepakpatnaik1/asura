/**
 * Chat File Charts API
 *
 * GET: Fetch charts for user's files (optionally filtered by enabled files only)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError } from '$lib/api/errors';

/**
 * GET /api/chat/files/charts
 *
 * Query params:
 * - enabled_only: If "true", only return charts from enabled files
 * - file_ids: Comma-separated list of file IDs to fetch charts for
 */
export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const enabledOnly = url.searchParams.get('enabled_only') === 'true';
	const fileIdsParam = url.searchParams.get('file_ids');

	// Build query - join to content table for file charts
	let query = supabase
		.from('article_charts')
		.select(`
			id,
			content_id,
			chart_index,
			storage_path,
			thumbnail_path,
			alt_text,
			is_pinned,
			created_at,
			articles!inner(id, title, is_enabled)
		`)
		.eq('user_id', userId)
		.not('content_id', 'is', null)
		.order('is_pinned', { ascending: false })
		.order('created_at', { ascending: false });

	// Filter by specific content IDs if provided
	if (fileIdsParam) {
		const fileIds = fileIdsParam.split(',').filter(Boolean);
		if (fileIds.length > 0) {
			query = query.in('content_id', fileIds);
		}
	}

	// Filter by enabled content only
	if (enabledOnly) {
		query = query.eq('articles.is_enabled', true);
	}

	const { data, error } = await query;

	if (error) {
		return databaseError('Failed to fetch file charts');
	}

	// Transform to public URLs (use relative URLs to go through Vite proxy in dev)
	const charts = (data || []).map((chart) => {
		// articles is a single object when using !inner join
		const content = chart.articles as unknown as { title: string } | null;
		return {
			id: chart.id,
			file_id: chart.content_id, // Keep API response naming for backwards compatibility
			chart_index: chart.chart_index,
			thumbnail_url: `/storage/v1/object/public/content/${chart.thumbnail_path}`,
			full_url: `/storage/v1/object/public/content/${chart.storage_path}`,
			alt: chart.alt_text,
			is_pinned: chart.is_pinned,
			source: 'file' as const,
			file_title: content?.title
		};
	});

	return json({ charts });
};
