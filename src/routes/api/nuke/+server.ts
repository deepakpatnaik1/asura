import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const POST: RequestHandler = async () => {
	try {
		console.log('[Nuke] Starting atomic database cleanup...');

		// Call atomic database function (deletes all user data in single transaction)
		const { error } = await supabase.rpc('nuke_all_data');

		if (error) {
			console.error('[Nuke] Atomic delete error:', error);
			return json({ error: 'Failed to nuke database' }, { status: 500 });
		}

		console.log('[Nuke] Successfully deleted all user data');

		return json({
			success: true,
			message: 'All user data deleted'
		});
	} catch (error) {
		console.error('[Nuke] Unexpected error:', error);
		return json({ error: 'Unexpected error during nuke operation' }, { status: 500 });
	}
};
