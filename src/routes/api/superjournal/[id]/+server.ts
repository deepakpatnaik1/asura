import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;

	try {
		console.log(`[DELETE Superjournal] Deleting entry: ${id}`);

		// Delete from superjournal (cascade will handle journal)
		const { error } = await supabase
			.from('superjournal')
			.delete()
			.eq('id', id);

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
