import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Helper to wait for journal entry to exist (Call 2 compression creates it)
async function waitForJournalEntry(
	supabase: any,
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
	const { user } = await safeGetSession();
	if (!user) {
		return json(
			{
				error: {
					message: 'Unauthorized - must be logged in',
					code: 'UNAUTHORIZED'
				}
			},
			{ status: 401 }
		);
	}
	const userId = user.id;
	const { id } = params;

	try {
		console.log(`[PATCH Superjournal] User ${userId} toggling star for entry: ${id}`);

		// Find the journal entry linked to this superjournal (wait if not yet created)
		let journalEntry = await waitForJournalEntry(supabase, id, userId);

		if (!journalEntry) {
			console.error('[PATCH Superjournal] Journal entry not found after polling');
			return json({ error: 'Journal entry not found' }, { status: 404 });
		}

		// Toggle the is_starred field
		const newStarredStatus = !journalEntry.is_starred;
		const { error: updateError } = await supabase
			.from('journal')
			.update({ is_starred: newStarredStatus })
			.eq('id', journalEntry.id)
			.eq('user_id', userId);

		if (updateError) {
			console.error('[PATCH Superjournal] Error updating star:', updateError);
			return json({ error: updateError.message }, { status: 500 });
		}

		console.log(`[PATCH Superjournal] Successfully toggled star to ${newStarredStatus} for: ${id}`);
		return json({ success: true, id, is_starred: newStarredStatus });
	} catch (error) {
		console.error('[PATCH Superjournal] Unexpected error:', error);
		return json({ error: 'Unexpected error' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	// 1. AUTHENTICATION CHECK
	const { user } = await safeGetSession();
	if (!user) {
		return json(
			{
				error: {
					message: 'Unauthorized - must be logged in',
					code: 'UNAUTHORIZED'
				}
			},
			{ status: 401 }
		);
	}
	const userId = user.id;

	const { id } = params;

	try {
		console.log(`[DELETE Superjournal] User ${userId} deleting entry: ${id}`);

		// Delete from superjournal (cascade will handle journal)
		// CRITICAL: Include user_id check to prevent cross-user deletions
		const { error } = await supabase
			.from('superjournal')
			.delete()
			.eq('id', id)
			.eq('user_id', userId);

		if (error) {
			console.error('[DELETE Superjournal] Error:', error);
			return json({ error: error.message }, { status: 500 });
		}

		console.log(`[DELETE Superjournal] Successfully deleted: ${id}`);
		return json({ success: true, id });
	} catch (error) {
		console.error('[DELETE Superjournal] Unexpected error:', error);
		return json({ error: 'Unexpected error' }, { status: 500 });
	}
};
