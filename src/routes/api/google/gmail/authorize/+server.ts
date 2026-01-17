import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { getGmailAuthorizationUrl } from '$lib/api/google-gmail';

/**
 * GET /api/google/gmail/authorize
 *
 * Initiates Google Gmail OAuth flow.
 * Redirects to Google consent screen.
 *
 * Query params:
 *   - type: 'personal' | 'company' (stored in state for callback)
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession }, url }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;

	// 2. GET ACCOUNT TYPE
	const accountType = url.searchParams.get('type') || 'personal';
	if (accountType !== 'personal' && accountType !== 'company') {
		return new Response('Invalid account type', { status: 400 });
	}

	// 3. BUILD REDIRECT URI
	const redirectUri = `${url.origin}/api/google/gmail/callback`;

	// 4. ENCODE STATE (userId + accountType for callback)
	const state = Buffer.from(JSON.stringify({ userId: auth.userId, accountType })).toString(
		'base64url'
	);

	// 5. REDIRECT TO GOOGLE
	const authUrl = getGmailAuthorizationUrl(redirectUri, state);
	throw redirect(302, authUrl);
};
