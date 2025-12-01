/**
 * Chat Files API - Toggle and Delete
 *
 * PUT: Toggle file enabled state
 * DELETE: Delete a file
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { databaseError, notFoundError, validationError } from '$lib/api/errors';

/**
 * PUT /api/chat/files/[id]
 * Toggle file enabled state for context injection
 */
export const PUT: RequestHandler = async ({ params, request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('File ID is required', 'id');
	}

	// Parse request body
	const parseResult = await parseRequestJson<{ is_enabled: boolean }>(request);
	if (!parseResult.success) return parseResult.error;

	const { is_enabled } = parseResult.data;

	if (typeof is_enabled !== 'boolean') {
		return validationError('is_enabled must be a boolean', 'is_enabled');
	}

	// Update content (RLS ensures user can only update their own content)
	const { data, error } = await supabase
		.from('content')
		.update({ is_enabled, updated_at: new Date().toISOString() })
		.eq('id', id)
		.eq('user_id', userId)
		.eq('mode', 'chat')
		.select('id')
		.single();

	if (error || !data) {
		return notFoundError('File not found');
	}

	return json({ success: true });
};

/**
 * DELETE /api/chat/files/[id]
 * Delete a file permanently
 */
export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('File ID is required', 'id');
	}

	// 1. FETCH CHARTS TO GET FILE PATHS (before deletion)
	const { data: charts } = await supabase
		.from('charts')
		.select('storage_path, thumbnail_path')
		.eq('content_id', id)
		.eq('user_id', userId);

	// 2. DELETE FILES FROM SUPABASE STORAGE
	const storagePaths: string[] = [];
	if (charts && charts.length > 0) {
		for (const chart of charts) {
			if (chart.storage_path) storagePaths.push(chart.storage_path);
			if (chart.thumbnail_path) storagePaths.push(chart.thumbnail_path);
		}
	}
	if (storagePaths.length > 0) {
		await supabase.storage.from('content').remove(storagePaths);
	}

	// 3. DELETE ASSOCIATED SUPERJOURNAL ENTRY (content marker in ai_response)
	await supabase
		.from('superjournal')
		.delete()
		.eq('user_id', userId)
		.like('ai_response', `<!--content:${id}-->%`);

	// 4. DELETE CONTENT FROM DATABASE (CASCADE handles charts via FK)
	const { error } = await supabase
		.from('content')
		.delete()
		.eq('id', id)
		.eq('user_id', userId)
		.eq('mode', 'chat');

	if (error) {
		return databaseError('Failed to delete file');
	}

	return json({ success: true });
};
