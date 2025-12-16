/**
 * Designer Canvases API - Get, Update, Delete
 * Uses canvas_designer table
 *
 * GET: Get canvas with full state
 * PUT: Update canvas (title and/or state)
 * DELETE: Delete canvas
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { databaseError, notFoundError, validationError } from '$lib/api/errors';

/**
 * GET /api/canvases/[id]
 * Get canvas with full state
 */
export const GET: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('Canvas ID is required', 'id');
	}

	const { data, error } = await supabase
		.from('canvas_designer')
		.select('*')
		.eq('id', id)
		.eq('user_id', userId)
		.single();

	if (error || !data) {
		return notFoundError('Canvas');
	}

	return json({ canvas: data });
};

/**
 * PUT /api/canvases/[id]
 * Update canvas title and/or state
 */
export const PUT: RequestHandler = async ({ params, request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('Canvas ID is required', 'id');
	}

	// Parse request body
	const parseResult = await parseRequestJson<{ title?: string; state?: unknown; is_selected?: boolean }>(request);
	if (!parseResult.success) return parseResult.error;

	const { title, state, is_selected } = parseResult.data;

	// Build update object with only provided fields
	const updateData: { title?: string; state?: unknown; is_selected?: boolean; updated_at: string } = {
		updated_at: new Date().toISOString()
	};

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

	if (state !== undefined) {
		// Basic validation - state should be an object
		if (typeof state !== 'object' || state === null) {
			return validationError('State must be an object', 'state');
		}
		updateData.state = state;
	}

	if (typeof is_selected === 'boolean') {
		updateData.is_selected = is_selected;
	}

	// Must have at least one field to update
	if (updateData.title === undefined && updateData.state === undefined && updateData.is_selected === undefined) {
		return validationError('Must provide title, state, or is_selected to update', 'body');
	}

	const { data, error } = await supabase
		.from('canvas_designer')
		.update(updateData)
		.eq('id', id)
		.eq('user_id', userId)
		.select('id')
		.single();

	if (error || !data) {
		return notFoundError('Canvas');
	}

	return json({ success: true });
};

/**
 * DELETE /api/canvases/[id]
 * Delete canvas permanently
 */
export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('Canvas ID is required', 'id');
	}

	const { error } = await supabase
		.from('canvas_designer')
		.delete()
		.eq('id', id)
		.eq('user_id', userId)

	if (error) {
		return databaseError('Failed to delete canvas');
	}

	return json({ success: true });
};
