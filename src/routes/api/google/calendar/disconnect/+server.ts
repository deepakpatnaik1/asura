import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';

/**
 * DELETE /api/google/calendar/disconnect
 *
 * Removes Google Calendar tokens for the user.
 * User will need to reconnect to re-authorize.
 */
export const DELETE: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. DELETE TOKENS
	const { error } = await supabase
		.from('google_tokens')
		.delete()
		.eq('user_id', userId);

	if (error) {
		return json({ error: 'Failed to disconnect' }, { status: 500 });
	}

	return json({ success: true });
};
