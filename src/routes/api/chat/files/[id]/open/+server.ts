/**
 * Open Content API
 *
 * POST: Open a file from library - finds original turn and enables content
 * Returns the original superjournal ID for scrolling (doesn't create new entries)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError, notFoundError, validationError } from '$lib/api/errors';

/**
 * POST /api/chat/files/[id]/open
 * Open content from library - returns original turn ID for navigation
 */
export const POST: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('Content ID is required', 'id');
	}

	// Fetch content record
	const { data: content, error: contentError } = await supabase
		.from('articles')
		.select('id, title')
		.eq('id', id)
		.eq('user_id', userId)
		.single();

	if (contentError || !content) {
		return notFoundError('Content not found');
	}

	// Find the original superjournal entry for this content
	const { data: originalEntry } = await supabase
		.from('superjournal')
		.select('id')
		.eq('content_id', id)
		.eq('user_id', userId)
		.order('created_at', { ascending: true })
		.limit(1)
		.single();

	// Enable the content for context injection
	await supabase
		.from('articles')
		.update({ is_enabled: true, updated_at: new Date().toISOString() })
		.eq('id', id)
		.eq('user_id', userId);

	// Return original entry ID for scrolling (or null if not found)
	return json({
		success: true,
		originalSuperjournalId: originalEntry?.id || null
	});
};
