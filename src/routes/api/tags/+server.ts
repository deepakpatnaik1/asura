/**
 * Tags API Endpoint
 *
 * GET: Fetch user's canonical tags
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const { session } = await safeGetSession();
	if (!session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { data: tags, error } = await supabase
		.from('canvas_planner_tags')
		.select('name')
		.eq('user_id', session.user.id)
		.order('name', { ascending: true });

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ tags: tags.map((t) => t.name) });
};
