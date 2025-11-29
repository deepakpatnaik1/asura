/**
 * Chat File Charts API
 *
 * GET: Fetch charts for user's files (optionally filtered by enabled files only)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError } from '$lib/api/errors';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

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

	// Build query
	let query = supabase
		.from('file_charts')
		.select(`
			id,
			file_id,
			chart_index,
			storage_path,
			thumbnail_path,
			alt_text,
			is_pinned,
			created_at,
			files!inner(id, title, is_enabled)
		`)
		.eq('user_id', userId)
		.order('is_pinned', { ascending: false })
		.order('created_at', { ascending: false });

	// Filter by specific file IDs if provided
	if (fileIdsParam) {
		const fileIds = fileIdsParam.split(',').filter(Boolean);
		if (fileIds.length > 0) {
			query = query.in('file_id', fileIds);
		}
	}

	// Filter by enabled files only
	if (enabledOnly) {
		query = query.eq('files.is_enabled', true);
	}

	const { data, error } = await query;

	if (error) {
		return databaseError('Failed to fetch file charts');
	}

	// Transform to public URLs
	const charts = (data || []).map((chart) => ({
		id: chart.id,
		file_id: chart.file_id,
		chart_index: chart.chart_index,
		thumbnail_url: `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/files/${chart.thumbnail_path}`,
		full_url: `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/files/${chart.storage_path}`,
		alt: chart.alt_text,
		is_pinned: chart.is_pinned,
		source: 'file' as const,
		file_title: (chart.files as { title: string })?.title
	}));

	return json({ charts });
};
