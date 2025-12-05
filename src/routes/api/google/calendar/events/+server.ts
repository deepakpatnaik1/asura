import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { fetchCalendarEvents, refreshAccessToken } from '$lib/api/google-calendar';
import { databaseError } from '$lib/api/errors';

/**
 * GET /api/google/calendar/events
 *
 * Fetches calendar events for the next 14 days.
 * Auto-refreshes access token if expired.
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. GET STORED TOKENS
	const { data: tokens, error: tokensError } = await supabase
		.from('google_tokens')
		.select('access_token, refresh_token, expires_at')
		.eq('user_id', userId)
		.single();

	if (tokensError || !tokens) {
		return json({ connected: false, events: [] });
	}

	// 3. CHECK IF TOKEN NEEDS REFRESH
	let accessToken = tokens.access_token;
	const expiresAt = new Date(tokens.expires_at);
	const now = new Date();

	// Refresh if expires in less than 5 minutes
	if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
		try {
			const refreshed = await refreshAccessToken(tokens.refresh_token);
			accessToken = refreshed.access_token;

			// Update stored token
			await supabase
				.from('google_tokens')
				.update({
					access_token: refreshed.access_token,
					expires_at: refreshed.expires_at.toISOString(),
					updated_at: new Date().toISOString()
				})
				.eq('user_id', userId);
		} catch (err) {
			console.error('Token refresh failed:', err);
			// Token might be revoked - clear it
			await supabase.from('google_tokens').delete().eq('user_id', userId);
			return json({ connected: false, events: [], error: 'token_expired' });
		}
	}

	// 4. FETCH EVENTS
	try {
		const events = await fetchCalendarEvents(accessToken, 14);
		return json({ connected: true, events });
	} catch (err) {
		console.error('Failed to fetch events:', err);
		return json({ connected: true, events: [], error: 'fetch_failed' });
	}
};
