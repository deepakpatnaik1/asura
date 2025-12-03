import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { notFoundError, databaseError, internalError } from '$lib/api/errors';

// Toggle starred status for a superjournal entry
// Creates placeholder journal row if compression hasn't run yet
export const PATCH: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;
	const { id } = params;

	try {
		// Check if journal entry exists
		const { data: journalEntry } = await supabase
			.from('journal')
			.select('id, is_starred')
			.eq('superjournal_id', id)
			.eq('user_id', userId)
			.single();

		if (journalEntry) {
			// Journal exists - toggle star
			const newStarredStatus = !journalEntry.is_starred;
			const { error: updateError } = await supabase
				.from('journal')
				.update({ is_starred: newStarredStatus })
				.eq('id', journalEntry.id)
				.eq('user_id', userId);

			if (updateError) {
				return databaseError('Failed to update starred status');
			}

			return json({ success: true, id, is_starred: newStarredStatus });
		}

		// Journal doesn't exist yet - verify superjournal exists and create placeholder
		const { data: superjournal } = await supabase
			.from('superjournal')
			.select('id, persona_name, user_message, ai_response')
			.eq('id', id)
			.eq('user_id', userId)
			.single();

		if (!superjournal) {
			return notFoundError('Superjournal entry');
		}

		// Create placeholder journal row with star enabled
		// Compression job will upsert and fill in the rest
		const { error: insertError } = await supabase.from('journal').insert({
			superjournal_id: id,
			user_id: userId,
			persona_name: superjournal.persona_name || 'unknown',
			boss_essence: superjournal.user_message || '',
			persona_essence: superjournal.ai_response || '',
			decision_arc_summary: 'Pending compression',
			salience_score: 5,
			is_starred: true,
			embedding: null
		});

		if (insertError) {
			return databaseError('Failed to create journal entry');
		}

		return json({ success: true, id, is_starred: true });
	} catch (error) {
		return internalError();
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;
	const { id } = params;

	try {
		// Delete from superjournal (cascade will handle journal)
		// CRITICAL: Include user_id check to prevent cross-user deletions
		const { error } = await supabase
			.from('superjournal')
			.delete()
			.eq('id', id)
			.eq('user_id', userId);

		if (error) {
			return databaseError('Failed to delete message');
		}

		return json({ success: true, id });
	} catch (error) {
		return internalError();
	}
};
