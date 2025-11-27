import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAuth } from '$lib/api/require-auth';
import { notFoundError, databaseError, internalError } from '$lib/api/errors';

// Helper to wait for journal entry to exist (Call 2 compression creates it)
async function waitForJournalEntry(
	supabase: SupabaseClient,
	superjournalId: string,
	userId: string,
	maxAttempts = 20,
	delayMs = 500
): Promise<{ id: string; is_starred: boolean } | null> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const { data } = await supabase
			.from('journal')
			.select('id, is_starred')
			.eq('superjournal_id', superjournalId)
			.eq('user_id', userId)
			.single();

		if (data) return data;

		// Wait before next attempt
		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}
	return null;
}

// Toggle starred status for a superjournal entry (updates linked journal entry)
export const PATCH: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;
	const { id } = params;

	try {
		// Find the journal entry linked to this superjournal (wait if not yet created)
		let journalEntry = await waitForJournalEntry(supabase, id, userId);

		if (!journalEntry) {
			return notFoundError('Journal entry');
		}

		// Toggle the is_starred field
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
