import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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
