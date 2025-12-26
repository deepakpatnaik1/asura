/**
 * Open Content API
 *
 * POST: Open a file from library - enables content and ensures it appears as a message turn
 * - If original superjournal entry exists → return its ID for scroll navigation
 * - If no entry exists → create one and return the new message for UI display
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError, notFoundError, validationError } from '$lib/api/errors';
import { DEFAULT_PERSONA } from '$lib/config/personas';

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

	// Enable the content for context injection
	await supabase
		.from('articles')
		.update({ is_enabled: true, updated_at: new Date().toISOString() })
		.eq('id', id)
		.eq('user_id', userId);

	// Find the original superjournal entry for this content
	const { data: originalEntry } = await supabase
		.from('superjournal')
		.select('id')
		.eq('content_id', id)
		.eq('user_id', userId)
		.order('created_at', { ascending: true })
		.limit(1)
		.single();

	// If original entry exists, return ID for scroll navigation
	if (originalEntry) {
		return json({
			success: true,
			existed: true,
			originalSuperjournalId: originalEntry.id
		});
	}

	// No entry exists - create one
	const { data: settings } = await supabase
		.from('user_settings')
		.select('selected_persona')
		.eq('user_id', userId)
		.single();

	const persona = settings?.selected_persona || DEFAULT_PERSONA;

	const { data: sjEntry, error: sjError } = await supabase
		.from('superjournal')
		.insert({
			user_id: userId,
			persona_name: persona,
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
