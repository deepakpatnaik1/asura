import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
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

	// 2. QUERY CURRENT MONTH'S TOKEN USAGE
	const { data, error } = await supabase.rpc('get_monthly_token_usage', {
		p_user_id: user.id
	});

	if (error) {
		console.error('[TokenUsage GET] Database error:', error);
		return json({ error: error.message }, { status: 500 });
	}

	// 3. RETURN AGGREGATED STATS
	// RPC returns single row, extract first element
	const stats = Array.isArray(data) && data.length > 0 ? data[0] : null;

	return json(
		stats || {
			total_input: 0,
			total_output: 0,
			total_cost_usd: 0.0
		}
	);
};
