/**
 * Ensure Entry API
 *
 * POST: Ensure a superjournal entry exists for an article (without changing is_enabled)
 * - If entry exists → return success
 * - If no entry exists → create one and return the new message
 *
 * Used on page load to ensure articles created outside normal flow (Gettysburg, SQL)
 * have corresponding message turns. Does NOT modify is_enabled state.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError, notFoundError, validationError } from '$lib/api/errors';

function formatTimestamp(dateString: string): string {
	const date = new Date(dateString);
	return date.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});
}

/**
 * POST /api/chat/files/[id]/ensure-entry
 * Ensure superjournal entry exists for content (does not touch is_enabled)
 */
export const POST: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('Content ID is required', 'id');
	}

	// Fetch content record (need title and raw_content for new entries)
	const { data: content, error: contentError } = await supabase
		.from('articles')
		.select('id, title, raw_content')
		.eq('id', id)
		.eq('user_id', userId)
		.single();

	if (contentError || !content) {
		return notFoundError('Content not found');
	}

	// Check if superjournal entry already exists
	// Note: Don't use .single() - it errors on 0 rows AND on 2+ rows,
	// which caused duplicate creation during the server restart experiment (Jan 5, 2026)
	const { data: existingEntries } = await supabase
		.from('superjournal')
		.select('id')
		.eq('content_id', id)
		.eq('user_id', userId)
		.limit(1);

	// If any entry exists, nothing to do
	if (existingEntries && existingEntries.length > 0) {
		return json({
			success: true,
			existed: true
		});
	}

	// No entry exists - create one
	// Use 'system' as persona_name so content turns don't pollute any persona's working/recent memory
	const { data: sjEntry, error: sjError } = await supabase
		.from('superjournal')
		.insert({
			user_id: userId,
			persona_name: 'system',
			user_message: `Boss uploaded ${content.title}`,
			ai_response: `<!--content:${content.id}-->`,
			model_identifier: 'file-upload',
			content_id: content.id
		})
		.select('*')
		.single();

	if (sjError || !sjEntry) {
		return databaseError('Failed to create message');
	}

	// Return new message for UI display
	return json({
		success: true,
		existed: false,
		message: {
			...sjEntry,
			ai_response: `<!--content:${content.id}-->\n${content.raw_content || ''}`,
			formatted_timestamp: formatTimestamp(sjEntry.created_at)
		}
	});
};
