/**
 * Todos API Endpoint
 *
 * GET: Fetch user's todos (optionally filtered by status)
 *      Auto-pushes overdue scheduled todos to today
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { session } = await safeGetSession();
	if (!session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = session.user.id;

	// Auto-push overdue todos to today
	// Find open todos scheduled for before today and push them
	const today = new Date().toISOString().split('T')[0];

	const { data: overdueTodos } = await supabase
		.from('todos')
		.select('id, times_pushed')
		.eq('user_id', userId)
		.eq('status', 'open')
		.lt('scheduled_for', today);

	if (overdueTodos && overdueTodos.length > 0) {
		// Update each overdue todo
		for (const todo of overdueTodos) {
			await supabase
				.from('todos')
				.update({
					scheduled_for: today,
					times_pushed: (todo.times_pushed || 0) + 1
				})
				.eq('id', todo.id);
		}
	}

	// Now fetch todos
	const status = url.searchParams.get('status'); // 'open', 'completed', or null for all
	const scheduled = url.searchParams.get('scheduled'); // 'true', 'false', or null for all

	let query = supabase
		.from('todos')
		.select('*')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });

	if (status) {
		query = query.eq('status', status);
	}

	// Filter by scheduled status
	if (scheduled === 'true') {
		query = query.not('scheduled_for', 'is', null);
	} else if (scheduled === 'false') {
		query = query.is('scheduled_for', null);
	}

	const { data: todos, error } = await query;

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ todos });
};
