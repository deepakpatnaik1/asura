import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { supabaseAdmin } from '$lib/supabase-admin';

/**
 * GET /api/google/gmail/accounts
 *
 * Returns list of connected Gmail accounts for the current user.
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;

	const { data, error } = await supabaseAdmin
		.from('gmail_accounts')
		.select('id, email, account_type, created_at, watch_expiration')
		.eq('user_id', auth.userId)
		.order('account_type');

	if (error) {
		console.error('Failed to fetch Gmail accounts:', error);
		return json({ error: 'Failed to fetch accounts' }, { status: 500 });
	}

	return json({ accounts: data });
};
