import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals: { safeGetSession } }) => {
	// If already logged in, redirect to home
	const { session } = await safeGetSession();

	if (session) {
		throw redirect(303, '/');
	}

	const error = url.searchParams.get('error');
	return { error };
};
