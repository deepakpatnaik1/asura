import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * DEV ONLY: Auto-login for local development
 * Bypasses Google OAuth by signing in with email/password
 */
export const GET: RequestHandler = async ({ locals: { supabase } }) => {
	const { error } = await supabase.auth.signInWithPassword({
		email: 'deepakpatnaik1@gmail.com',
		password: 'localdev123'
	});

	if (error) {
		console.error('[Dev Login] Error:', error.message);
		return new Response(`Login failed: ${error.message}`, { status: 500 });
	}

	throw redirect(303, '/');
};
