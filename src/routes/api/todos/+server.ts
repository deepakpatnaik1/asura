/**
 * Todos API Endpoint
 *
 * GET: Fetch user's todos (optionally filtered by status)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { session } = await safeGetSession();
	if (!session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = session.user.id;

	// Fetch todos
	const status = url.searchParams.get('status'); // 'open', 'completed', or null for all

	let query = supabase
		.from('todos')
		.select('*')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });

	if (status) {
		query = query.eq('status', status);
	}

	const { data: todos, error } = await query;

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ todos });
};
