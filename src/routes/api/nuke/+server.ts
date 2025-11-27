import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
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

		// 2. Delete user data
		const { error: superjournalError } = await supabase
			.from('superjournal')
			.delete()
			.eq('user_id', userId);

		if (superjournalError) {
			return json({ error: 'Failed to delete superjournal data' }, { status: 500 });
		}

		const { error: journalError } = await supabase
			.from('journal')
			.delete()
			.eq('user_id', userId);

		if (journalError) {
			return json({ error: 'Failed to delete journal data' }, { status: 500 });
		}

		// Delete user settings
		const { error: settingsError } = await supabase
			.from('user_settings')
			.delete()
			.eq('user_id', userId);

		if (settingsError) {
			return json({ error: 'Failed to delete settings' }, { status: 500 });
		}

		return json({
			success: true,
			message: 'All your data has been deleted'
		});
	} catch (error) {
		return json({ error: 'Unexpected error during nuke operation' }, { status: 500 });
	}
};
