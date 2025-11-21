import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const POST: RequestHandler = async ({ locals: { safeGetSession } }) => {
	try {
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

		console.log(`[Nuke] Starting user data cleanup for user: ${userId}`);

		// 2. Delete user data
		const { error: superjournalError } = await supabase
			.from('superjournal')
			.delete()
			.eq('user_id', userId);

		if (superjournalError) {
			console.error('[Nuke] Superjournal delete error:', superjournalError);
			return json({ error: 'Failed to delete superjournal data' }, { status: 500 });
		}

		const { error: journalError } = await supabase
			.from('journal')
			.delete()
			.eq('user_id', userId);

		if (journalError) {
			console.error('[Nuke] Journal delete error:', journalError);
			return json({ error: 'Failed to delete journal data' }, { status: 500 });
		}

		// Delete user settings
		const { error: settingsError } = await supabase
			.from('user_settings')
			.delete()
			.eq('user_id', userId);

		if (settingsError) {
			console.error('[Nuke] Settings delete error:', settingsError);
			return json({ error: 'Failed to delete settings' }, { status: 500 });
		}

		console.log(`[Nuke] Successfully deleted all data for user: ${userId}`);

		return json({
			success: true,
			message: 'All your data has been deleted'
		});
	} catch (error) {
		console.error('[Nuke] Unexpected error:', error);
		return json({ error: 'Unexpected error during nuke operation' }, { status: 500 });
	}
};
