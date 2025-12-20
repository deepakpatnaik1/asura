/**
 * Designer Canvases API - List and Create
 * Uses canvas_designer table
 *
 * GET: List user's designer canvases
 * POST: Create a new designer canvas
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { databaseError, validationError } from '$lib/api/errors';

/**
 * GET /api/canvases
 * List all designer canvases for the user
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { data: canvases, error } = await supabase
		.from('canvas_designer')
		.select('id, title, is_selected, created_at, updated_at')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });

	if (error) {
		return databaseError('Failed to fetch canvases');
	}

	return json({ canvases });
};

/**
 * POST /api/canvases
 * Create a new designer canvas
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
	let canvasTitle = 'Untitled';
	if (title !== undefined) {
		const trimmedTitle = title.trim();
		if (trimmedTitle.length === 0) {
			return validationError('Title cannot be empty', 'title');
		}
		if (trimmedTitle.length > 255) {
			return validationError('Title must be 255 characters or less', 'title');
		}
		canvasTitle = trimmedTitle;
	}

	const { data, error } = await supabase
		.from('canvas_designer')
		.insert({
			user_id: userId,
			title: canvasTitle,
			state: { render: [], semantic: {}, viewport: { x: 0, y: 0, scale: 1 } }
		})
		.select('id, title, created_at, updated_at')
		.single();

	if (error) {
		return databaseError('Failed to create canvas');
	}

	return json({ canvas: data }, { status: 201 });
};
