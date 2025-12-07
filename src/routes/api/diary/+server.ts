/**
 * Founder Diary API Endpoint
 *
 * GET: Fetch user's diary entries (most recent first)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { session } = await safeGetSession();
	if (!session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = session.user.id;

	const { data: entries, error } = await supabase
		.from('founder_diary')
		.select('*')
		.eq('user_id', userId)
		.order('sort_date', { ascending: true });

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ entries });
};
