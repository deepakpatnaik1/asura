import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { exchangeGmailCodeForTokens } from '$lib/api/google-gmail';
import { supabaseAdmin } from '$lib/supabase-admin';

/**
 * GET /api/google/gmail/callback
 *
 * Handles OAuth callback from Google.
 * Exchanges code for tokens and stores in gmail_accounts table.
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession }, url }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. GET AUTHORIZATION CODE AND STATE
	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');
	const stateParam = url.searchParams.get('state');

	if (error) {
		console.error('Gmail OAuth denied:', error);
		throw redirect(302, '/?error=gmail_denied');
	}

	if (!code) {
		throw redirect(302, '/?error=no_code');
	}

	// 3. DECODE STATE
	let accountType = 'personal';
	if (stateParam) {
		try {
			const state = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
			accountType = state.accountType || 'personal';
		} catch {
			console.warn('Failed to decode state, defaulting to personal');
		}
	}

	// 4. EXCHANGE CODE FOR TOKENS
	const redirectUri = `${url.origin}/api/google/gmail/callback`;

	try {
		const tokens = await exchangeGmailCodeForTokens(code, redirectUri);

		// 5. STORE IN DATABASE (upsert by user_id + email)
		// Using admin client to bypass RLS for localhost
		const { error: dbError } = await supabaseAdmin.from('gmail_accounts').upsert(
			{
				user_id: userId,
				email: tokens.email,
				account_type: accountType,
				access_token: tokens.access_token,
				refresh_token: tokens.refresh_token,
				token_expires_at: tokens.expires_at.toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				onConflict: 'user_id,email'
			}
		);

		if (dbError) {
			console.error('Failed to store Gmail tokens:', dbError);
			throw redirect(302, '/?error=storage_failed');
		}

		// 6. REDIRECT TO HOME PAGE
		throw redirect(302, `/?gmail=connected&email=${encodeURIComponent(tokens.email)}`);
	} catch (err) {
		if (err instanceof Response) throw err; // Re-throw redirects
		console.error('Gmail OAuth callback error:', err);
		throw redirect(302, '/?error=oauth_failed');
	}
};
