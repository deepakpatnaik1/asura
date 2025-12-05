/**
 * Google Calendar OAuth Helper
 *
 * Handles OAuth token exchange, refresh, and calendar API calls.
 */

import { env } from '$env/dynamic/private';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

// Read-only scope for Phase 2
const SCOPES = ['https://www.googleapis.com/auth/calendar.events.readonly'];

export interface GoogleTokens {
	access_token: string;
	refresh_token: string;
	expires_at: Date;
}

export interface CalendarEvent {
	id: string;
	summary: string;
	start: { dateTime?: string; date?: string };
	end: { dateTime?: string; date?: string };
	description?: string;
	location?: string;
	attendees?: { email: string; responseStatus: string }[];
}

/**
 * Generate the Google OAuth authorization URL
 */
export function getAuthorizationUrl(redirectUri: string, state?: string): string {
	const clientId = env.GOOGLE_CLIENT_ID;
	if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');

	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: SCOPES.join(' '),
		access_type: 'offline', // Get refresh token
		prompt: 'consent' // Always show consent to get refresh token
	});

	if (state) {
		params.set('state', state);
	}

	return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
	code: string,
	redirectUri: string
): Promise<GoogleTokens> {
	const clientId = env.GOOGLE_CLIENT_ID;
	const clientSecret = env.GOOGLE_CLIENT_SECRET;
	if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured');

	const response = await fetch(GOOGLE_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			grant_type: 'authorization_code',
			redirect_uri: redirectUri
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Token exchange failed: ${error}`);
	}

	const data = await response.json();

	return {
		access_token: data.access_token,
		refresh_token: data.refresh_token,
		expires_at: new Date(Date.now() + data.expires_in * 1000)
	};
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
	access_token: string;
	expires_at: Date;
}> {
	const clientId = env.GOOGLE_CLIENT_ID;
	const clientSecret = env.GOOGLE_CLIENT_SECRET;
	if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured');

	const response = await fetch(GOOGLE_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: 'refresh_token'
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Token refresh failed: ${error}`);
	}

	const data = await response.json();

	return {
		access_token: data.access_token,
		expires_at: new Date(Date.now() + data.expires_in * 1000)
	};
}

/**
 * Fetch calendar events from the "work" calendar
 */
export async function fetchCalendarEvents(
	accessToken: string,
	daysAhead: number = 14
): Promise<CalendarEvent[]> {
	const now = new Date();
	const timeMin = now.toISOString();
	const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

	// First, find the "work" calendar ID
	const calendarsResponse = await fetch(`${CALENDAR_API_BASE}/users/me/calendarList`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (!calendarsResponse.ok) {
		throw new Error('Failed to fetch calendar list');
	}

	const calendarsData = await calendarsResponse.json();
	const workCalendar = calendarsData.items?.find(
		(cal: { summary: string }) => cal.summary.toLowerCase() === 'work'
	);

	if (!workCalendar) {
		// Fallback to primary calendar if "work" not found
		return fetchEventsFromCalendar(accessToken, 'primary', timeMin, timeMax);
	}

	return fetchEventsFromCalendar(accessToken, workCalendar.id, timeMin, timeMax);
}

async function fetchEventsFromCalendar(
	accessToken: string,
	calendarId: string,
	timeMin: string,
	timeMax: string
): Promise<CalendarEvent[]> {
	const params = new URLSearchParams({
		timeMin,
		timeMax,
		singleEvents: 'true',
		orderBy: 'startTime',
		maxResults: '100'
	});

	const response = await fetch(
		`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
		{
			headers: { Authorization: `Bearer ${accessToken}` }
		}
	);

	if (!response.ok) {
		throw new Error('Failed to fetch calendar events');
	}

	const data = await response.json();
	return data.items || [];
}
