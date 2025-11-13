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

		// Step 2: Delete all Journal entries
		// Using dummy condition to delete all rows (Supabase requires a WHERE clause)
		const { error: journalError } = await supabase
			.from('journal')
			.delete()
			.neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (dummy condition)

		if (journalError) {
			console.error('[Nuke] Journal delete error:', journalError);
			return json({ error: 'Failed to delete orphaned journal entries' }, { status: 500 });
		}

		console.log('[Nuke] Successfully deleted all Journal entries');

		// Step 3: Delete all Files entries
		const { error: filesError } = await supabase
			.from('files')
			.delete()
			.neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (dummy condition)

		if (filesError) {
			console.error('[Nuke] Files delete error:', filesError);
			return json({ error: 'Failed to delete files' }, { status: 500 });
		}

		console.log('[Nuke] Successfully deleted all Files entries');

		return json({
			success: true,
			message: 'All Superjournal, Journal, and Files entries deleted'
		});
	} catch (error) {
		console.error('[Nuke] Unexpected error:', error);
		return json({ error: 'Unexpected error during nuke operation' }, { status: 500 });
	}
};
