/**
 * Whiteboards API - List and Create
 * Uses unified canvases table with type='whiteboard'
 *
 * GET: List user's whiteboards
 * POST: Create a new whiteboard
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { databaseError, validationError } from '$lib/api/errors';

/**
 * GET /api/whiteboards
 * List all whiteboards for the user
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { data: whiteboards, error } = await supabase
		.from('canvas_whiteboard')
		.select('id, title, is_selected, is_starred, created_at, updated_at')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });

	if (error) {
		return databaseError('Failed to fetch whiteboards');
	}

	return json({ whiteboards });
};

/**
 * POST /api/whiteboards
 * Create a new whiteboard
 */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// Parse optional title from request body
	const parseResult = await parseRequestJson<{ title?: string }>(request);
	if (!parseResult.success) return parseResult.error;

	const { title } = parseResult.data;

	// Validate title if provided
	let whiteboardTitle = 'Untitled';
	if (title !== undefined) {
		const trimmedTitle = title.trim();
		if (trimmedTitle.length === 0) {
			return validationError('Title cannot be empty', 'title');
		}
		if (trimmedTitle.length > 255) {
			return validationError('Title must be 255 characters or less', 'title');
		}
		whiteboardTitle = trimmedTitle;
	}

	const { data, error } = await supabase
		.from('canvas_whiteboard')
		.insert({
			user_id: userId,
			title: whiteboardTitle,
			state: { notes: [], viewport: { x: 0, y: 0, scale: 1 } }
		})
		.select('id, title, created_at, updated_at')
		.single();

	if (error) {
		return databaseError('Failed to create whiteboard');
	}

	return json({ whiteboard: data }, { status: 201 });
};
