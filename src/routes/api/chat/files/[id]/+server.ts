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

	// Update file (RLS ensures user can only update their own files)
	const { data, error } = await supabase
		.from('files')
		.update({ is_enabled, updated_at: new Date().toISOString() })
		.eq('id', id)
		.eq('user_id', userId)
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

	// Delete file (RLS ensures user can only delete their own files)
	const { error } = await supabase
		.from('files')
		.delete()
		.eq('id', id)
		.eq('user_id', userId);

	if (error) {
		return databaseError('Failed to delete file');
	}

	return json({ success: true });
};
