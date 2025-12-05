import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { getAuthorizationUrl } from '$lib/api/google-calendar';

/**
 * GET /api/google/calendar/authorize
 *
 * Initiates Google Calendar OAuth flow.
 * Redirects to Google consent screen.
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession }, url }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;

	// 2. BUILD REDIRECT URI
	const redirectUri = `${url.origin}/api/google/calendar/callback`;

	// 3. REDIRECT TO GOOGLE
	const authUrl = getAuthorizationUrl(redirectUri, auth.userId);
	throw redirect(302, authUrl);
};
