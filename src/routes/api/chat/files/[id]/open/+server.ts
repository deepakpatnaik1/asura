/**
 * Open Content API
 *
 * POST: Open a file from library - creates superjournal entry and enables content
 * Returns the new message for immediate UI display
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
 * Open content from library - creates superjournal entry showing content in UI
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
		.from('content')
		.select('id, title, raw_content')
		.eq('id', id)
		.eq('user_id', userId)
		.single();

	if (contentError || !content) {
		return notFoundError('Content not found');
	}

	// Fetch user's selected persona
	const { data: settings } = await supabase
		.from('user_settings')
		.select('selected_persona')
		.eq('user_id', userId)
		.single();

	const persona = settings?.selected_persona || DEFAULT_PERSONA;

	// Create superjournal entry
	const { data: sjEntry, error: sjError } = await supabase
		.from('superjournal')
		.insert({
			user_id: userId,
			persona_name: persona,
			user_message: `Boss reopened ${content.title}`,
			ai_response: `<!--content:${content.id}-->`,
			model_identifier: 'file-open',
			content_id: content.id
		})
		.select('*')
		.single();

	if (sjError || !sjEntry) {
		return databaseError('Failed to create message');
	}

	// Enable the content for context injection
	await supabase
		.from('content')
		.update({ is_enabled: true, updated_at: new Date().toISOString() })
		.eq('id', id)
		.eq('user_id', userId);

	// Return message in same format as page load (with expanded content)
	return json({
		success: true,
		message: {
			...sjEntry,
			ai_response: `<!--content:${content.id}-->\n${content.raw_content || ''}`,
			formatted_timestamp: formatTimestamp(sjEntry.created_at)
		}
	});
};
