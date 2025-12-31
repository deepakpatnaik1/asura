/**
 * Whiteboards API - Get, Update, Delete
 * Uses unified canvases table with type='whiteboard'
 *
 * GET: Get whiteboard with full state
 * PUT: Update whiteboard (title and/or state)
 * DELETE: Delete whiteboard
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { databaseError, notFoundError, validationError } from '$lib/api/errors';

/**
 * GET /api/whiteboards/[id]
 * Get whiteboard with full state
 */
export const GET: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('Whiteboard ID is required', 'id');
	}

	const { data, error } = await supabase
		.from('canvas_whiteboard')
		.select('*')
		.eq('id', id)
		.eq('user_id', userId)
		.single();

	if (error || !data) {
		return notFoundError('Whiteboard');
	}

	return json({ whiteboard: data });
};

/**
 * PUT /api/whiteboards/[id]
 * Update whiteboard title and/or state
 */
export const PUT: RequestHandler = async ({ params, request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('Whiteboard ID is required', 'id');
	}

	// Parse request body
	const parseResult = await parseRequestJson<{ title?: string; state?: unknown; is_selected?: boolean; is_starred?: boolean }>(request);
	if (!parseResult.success) return parseResult.error;

	const { title, state, is_selected, is_starred } = parseResult.data;

	// Build update object with only provided fields
	const updateData: { title?: string; state?: unknown; is_selected?: boolean; is_starred?: boolean; updated_at: string } = {
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
		// Basic validation - state should be an object with notes array
		if (typeof state !== 'object' || state === null) {
			return validationError('State must be an object', 'state');
		}
		updateData.state = state;
	}

	if (typeof is_selected === 'boolean') {
		updateData.is_selected = is_selected;
	}

	if (typeof is_starred === 'boolean') {
		updateData.is_starred = is_starred;
	}

	// Must have at least one field to update
	if (updateData.title === undefined && updateData.state === undefined && updateData.is_selected === undefined && updateData.is_starred === undefined) {
		return validationError('Must provide title, state, is_selected, or is_starred to update', 'body');
	}

	const { data, error } = await supabase
		.from('canvas_whiteboard')
		.update(updateData)
		.eq('id', id)
		.eq('user_id', userId)
		.select('id')
		.single();

	if (error || !data) {
		return notFoundError('Whiteboard');
	}

	return json({ success: true });
};

/**
 * DELETE /api/whiteboards/[id]
 * Delete whiteboard permanently
 */
export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('Whiteboard ID is required', 'id');
	}

	const { error } = await supabase
		.from('canvas_whiteboard')
		.delete()
		.eq('id', id)
		.eq('user_id', userId)

	if (error) {
		return databaseError('Failed to delete whiteboard');
	}

	return json({ success: true });
};
