import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

export const POST: RequestHandler = async () => {
	try {
		console.log('[Nuke] Starting database cleanup...');

		// Step 1: Delete all Superjournal entries
		const { error: superjournalError } = await supabase
			.from('superjournal')
			.delete()
			.neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (dummy condition)

		if (superjournalError) {
			console.error('[Nuke] Superjournal delete error:', superjournalError);
			return json({ error: 'Failed to delete superjournal entries' }, { status: 500 });
		}

		console.log('[Nuke] Successfully deleted all Superjournal entries');

		// Step 2: Delete Journal entries without a valid superjournal_id
		// (This will delete orphaned entries since all superjournal rows are now gone)
		const { error: journalError } = await supabase
			.from('journal')
			.delete()
			.not('superjournal_id', 'is', null); // Delete all that have a superjournal_id (which are now orphaned)

		if (journalError) {
			console.error('[Nuke] Journal delete error:', journalError);
			return json({ error: 'Failed to delete orphaned journal entries' }, { status: 500 });
		}

		console.log('[Nuke] Successfully deleted orphaned Journal entries');

		return json({
			success: true,
			message: 'All Superjournal and orphaned Journal entries deleted'
		});
	} catch (error) {
		console.error('[Nuke] Unexpected error:', error);
		return json({ error: 'Unexpected error during nuke operation' }, { status: 500 });
	}
};
