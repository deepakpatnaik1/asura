import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals: { supabase }, url }) => {
	const { data, error } = await supabase.auth.signInWithOAuth({
		provider: 'google',
		options: {
			redirectTo: `${url.origin}/auth/callback`
		}
	});

	if (error) {
		console.error('[Google OAuth] Error initiating OAuth:', error.message);
		return json({ error: error.message }, { status: 400 });
	}

	return json({ url: data.url });
};
