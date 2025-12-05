import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { exchangeCodeForTokens } from '$lib/api/google-calendar';
import { json } from '@sveltejs/kit';

/**
 * GET /api/google/calendar/callback
 *
 * Handles OAuth callback from Google.
 * Exchanges code for tokens and stores in database.
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase }, url }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. GET AUTHORIZATION CODE
	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');

	if (error) {
		// User denied access or other error
		throw redirect(302, '/todo?error=calendar_denied');
	}

	if (!code) {
		throw redirect(302, '/todo?error=no_code');
	}

	// 3. EXCHANGE CODE FOR TOKENS
	const redirectUri = `${url.origin}/api/google/calendar/callback`;

	try {
		const tokens = await exchangeCodeForTokens(code, redirectUri);

		// 4. STORE TOKENS IN DATABASE (upsert)
		const { error: dbError } = await supabase.from('google_tokens').upsert(
			{
				user_id: userId,
				access_token: tokens.access_token,
				refresh_token: tokens.refresh_token,
				expires_at: tokens.expires_at.toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				onConflict: 'user_id'
			}
		);

		if (dbError) {
			console.error('Failed to store tokens:', dbError);
			throw redirect(302, '/todo?error=storage_failed');
		}

		// 5. REDIRECT TO TODO PAGE
		throw redirect(302, '/todo?calendar=connected');
	} catch (err) {
		if (err instanceof Response) throw err; // Re-throw redirects
		console.error('OAuth callback error:', err);
		throw redirect(302, '/todo?error=oauth_failed');
	}
};
