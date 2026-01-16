/**
 * Open Content API
 *
 * POST: Open a file from library - ensures it appears as a message turn
 * - If original superjournal entry exists → return its ID for scroll navigation
 * - If no entry exists → create one and return the new message for UI display
 *
 * Note: No longer sets is_enabled - context injection is now owner-based.
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
 * POST /api/chat/files/[id]/open
 * Open content from library - ensures content appears as a message turn
 */
export const POST: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('Content ID is required', 'id');
	}

	// Fetch content record (need raw_content for new entries)
	const { data: content, error: contentError } = await supabase
		.from('articles')
		.select('id, title, raw_content')
		.eq('id', id)
		.eq('user_id', userId)
		.single();

	if (contentError || !content) {
		return notFoundError('Content not found');
	}

	// Find the original superjournal entry for this content
	// Note: Don't use .single() - it errors on 0 rows AND on 2+ rows,
	// which caused duplicate creation during the server restart experiment (Jan 5, 2026)
	const { data: originalEntries } = await supabase
		.from('superjournal')
		.select('id')
		.eq('content_id', id)
		.eq('user_id', userId)
		.order('created_at', { ascending: true })
		.limit(1);

	// If original entry exists, return ID for scroll navigation
	if (originalEntries && originalEntries.length > 0) {
		return json({
			success: true,
			existed: true,
			originalSuperjournalId: originalEntries[0].id
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
