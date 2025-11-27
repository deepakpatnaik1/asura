import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals: { supabase } }) => {
	const { error } = await supabase.auth.signOut();

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	// Cookies cleared automatically by @supabase/ssr
	throw redirect(303, '/login');
};
