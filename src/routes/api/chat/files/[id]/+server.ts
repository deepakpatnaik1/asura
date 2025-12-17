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
 * Update content: toggle enabled state or rename title
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
	const parseResult = await parseRequestJson<{ is_enabled?: boolean; title?: string }>(request);
	if (!parseResult.success) return parseResult.error;

	const { is_enabled, title } = parseResult.data;

	// Build update object with only provided fields
	const updateData: { is_enabled?: boolean; title?: string; updated_at: string } = {
		updated_at: new Date().toISOString()
	};

	if (typeof is_enabled === 'boolean') {
		updateData.is_enabled = is_enabled;
	}

	if (typeof title === 'string') {
		const trimmedTitle = title.trim();
		if (trimmedTitle.length === 0) {
			return validationError('Title cannot be empty', 'title');
		}
		if (trimmedTitle.length > 255) {
			return validationError('Title must be 255 characters or less', 'title');
		}
		updateData.title = trimmedTitle;
	}

	// Must have at least one field to update
	if (updateData.is_enabled === undefined && updateData.title === undefined) {
		return validationError('Must provide is_enabled or title to update', 'body');
	}

	// Update content (RLS ensures user can only update their own content)
	const { data, error } = await supabase
		.from('articles')
		.update(updateData)
		.eq('id', id)
		.eq('user_id', userId)
		.select('id')
		.single();

	if (error || !data) {
		return notFoundError('Content not found');
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
		.from('article_charts')
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
	// No mode filter - user owns the content, ID is unique
	const { error } = await supabase
		.from('articles')
		.delete()
		.eq('id', id)
		.eq('user_id', userId);

	if (error) {
		return databaseError('Failed to delete file');
	}

	return json({ success: true });
};
