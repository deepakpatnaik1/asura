import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { supabaseAdmin } from '$lib/supabase-admin';

/**
 * DELETE /api/google/gmail/disconnect
 *
 * Disconnects a Gmail account.
 *
 * Body: { email: string }
 */
export const DELETE: RequestHandler = async ({ locals: { safeGetSession }, request }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;

	const body = await request.json();
	const { email } = body;

	if (!email) {
		return json({ error: 'Email required' }, { status: 400 });
	}

	// Delete the account (cascades to watch_rules and processed)
	const { error } = await supabaseAdmin
		.from('gmail_accounts')
		.delete()
		.eq('user_id', auth.userId)
		.eq('email', email);

	if (error) {
		console.error('Failed to disconnect Gmail account:', error);
		return json({ error: 'Failed to disconnect' }, { status: 500 });
	}

	return json({ success: true });
};
