import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError, internalError } from '$lib/api/errors';

export const POST: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	try {
		// 1. AUTHENTICATION CHECK
		const auth = await requireAuth(safeGetSession);
		if (!auth.success) return auth.error;
		const { userId } = auth;

		// 2. Delete user data
		const { error: superjournalError } = await supabase
			.from('superjournal')
			.delete()
			.eq('user_id', userId);

		if (superjournalError) {
			return databaseError('Failed to delete superjournal data');
		}

		const { error: journalError } = await supabase
			.from('journal')
			.delete()
			.eq('user_id', userId);

		if (journalError) {
			return databaseError('Failed to delete journal data');
		}

		// Delete user settings
		const { error: settingsError } = await supabase
			.from('user_settings')
			.delete()
			.eq('user_id', userId);

		if (settingsError) {
			return databaseError('Failed to delete settings');
		}

		return json({
			success: true,
			message: 'All your data has been deleted'
		});
	} catch (error) {
		return internalError('Unexpected error during nuke operation');
	}
};
