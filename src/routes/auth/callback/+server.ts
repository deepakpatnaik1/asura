import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const code = url.searchParams.get('code');
	const next = url.searchParams.get('next') ?? '/';

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);

		if (error) {
			console.error('[OAuth Callback] Error exchanging code:', error.message);
			throw redirect(303, '/login?error=auth_failed');
		}

		// No manual cookie management needed - @supabase/ssr handles it automatically
		throw redirect(303, next);
	}

	// No code parameter, redirect to login
	throw redirect(303, '/login');
};
