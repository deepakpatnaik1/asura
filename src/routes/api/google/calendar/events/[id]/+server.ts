import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import {
	refreshAccessToken,
	updateCalendarEvent,
	deleteCalendarEvent,
	getWorkCalendarId,
	type UpdateEventInput
} from '$lib/api/google-calendar';

/**
 * PATCH /api/google/calendar/events/[id]
 *
 * Update an existing calendar event.
 */
export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession, supabase }
}) => {
	const eventId = params.id;
	if (!eventId) {
		return json({ error: 'missing_event_id' }, { status: 400 });
	}

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
		return json({ error: 'not_connected' }, { status: 401 });
	}

	// 3. CHECK IF TOKEN NEEDS REFRESH
	let accessToken = tokens.access_token;
	const expiresAt = new Date(tokens.expires_at);
	const now = new Date();

	if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
		try {
			const refreshed = await refreshAccessToken(tokens.refresh_token);
			accessToken = refreshed.access_token;

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
			await supabase.from('google_tokens').delete().eq('user_id', userId);
			return json({ error: 'token_expired' }, { status: 401 });
		}
	}

	// 4. PARSE REQUEST BODY
	let updates: UpdateEventInput;
	try {
		updates = await request.json();
	} catch {
		return json({ error: 'invalid_json' }, { status: 400 });
	}

	// 5. UPDATE EVENT
	try {
		const calendarId = await getWorkCalendarId(accessToken);
		const event = await updateCalendarEvent(accessToken, calendarId, eventId, updates);
		return json({ success: true, event });
	} catch (err) {
		console.error('Failed to update event:', err);
		return json({ error: 'update_failed', message: String(err) }, { status: 500 });
	}
};

/**
 * DELETE /api/google/calendar/events/[id]
 *
 * Delete a calendar event.
 */
export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const eventId = params.id;
	if (!eventId) {
		return json({ error: 'missing_event_id' }, { status: 400 });
	}

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
		return json({ error: 'not_connected' }, { status: 401 });
	}

	// 3. CHECK IF TOKEN NEEDS REFRESH
	let accessToken = tokens.access_token;
	const expiresAt = new Date(tokens.expires_at);
	const now = new Date();

	if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
		try {
			const refreshed = await refreshAccessToken(tokens.refresh_token);
			accessToken = refreshed.access_token;

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
			await supabase.from('google_tokens').delete().eq('user_id', userId);
			return json({ error: 'token_expired' }, { status: 401 });
		}
	}

	// 4. DELETE EVENT
	try {
		const calendarId = await getWorkCalendarId(accessToken);
		await deleteCalendarEvent(accessToken, calendarId, eventId);
		return json({ success: true });
	} catch (err) {
		console.error('Failed to delete event:', err);
		return json({ error: 'delete_failed', message: String(err) }, { status: 500 });
	}
};
