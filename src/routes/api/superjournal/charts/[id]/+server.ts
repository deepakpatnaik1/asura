import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { z } from 'zod';
import { validateSchema } from '$lib/schemas';

/**
 * Superjournal Chart Endpoints
 *
 * PUT /api/superjournal/charts/[id]
 * Body: { is_pinned: boolean }
 * Response: { success: true }
 *
 * DELETE /api/superjournal/charts/[id]
 * Response: { success: true }
 */

const updateChartSchema = z.object({
	is_pinned: z.boolean()
});

export const PUT: RequestHandler = async ({ params, request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const chartId = params.id;

	// 2. PARSE AND VALIDATE REQUEST BODY
	const parseResult = await parseRequestJson<unknown>(request);
	if (!parseResult.success) return parseResult.error;

	const validation = validateSchema(updateChartSchema, parseResult.data);
	if (!validation.success) return validation.error;

	const { is_pinned } = validation.data;

	// 3. UPDATE CHART
	const { error: updateError } = await supabase
		.from('superjournal_charts')
		.update({ is_pinned })
		.eq('id', chartId)
		.eq('user_id', userId);

	if (updateError) {
		return json(
			{
				error: {
					message: 'Failed to update chart',
					code: 'DATABASE_ERROR'
				}
			},
			{ status: 500 }
		);
	}

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const chartId = params.id;

	// 2. FETCH CHART TO GET STORAGE PATHS
	const { data: chart, error: fetchError } = await supabase
		.from('superjournal_charts')
		.select('storage_path, thumbnail_path')
		.eq('id', chartId)
		.eq('user_id', userId)
		.single();

	if (fetchError || !chart) {
		return json(
			{
				error: {
					message: 'Chart not found',
					code: 'NOT_FOUND'
				}
			},
			{ status: 404 }
		);
	}

	// 3. DELETE STORAGE FILES
	const filesToDelete = [chart.storage_path];
	if (chart.thumbnail_path) {
		filesToDelete.push(chart.thumbnail_path);
	}

	const { error: storageError } = await supabase.storage
		.from('articles')
		.remove(filesToDelete);

	if (storageError) {
		console.error('[Chart Delete] Storage delete failed:', storageError);
		// Continue with DB delete even if storage fails
	}

	// 4. DELETE DATABASE RECORD
	const { error: deleteError } = await supabase
		.from('superjournal_charts')
		.delete()
		.eq('id', chartId)
		.eq('user_id', userId);

	if (deleteError) {
		return json(
			{
				error: {
					message: 'Failed to delete chart',
					code: 'DATABASE_ERROR'
				}
			},
			{ status: 500 }
		);
	}

	return json({ success: true });
};
