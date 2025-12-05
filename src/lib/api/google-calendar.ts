/**
 * Google Calendar OAuth Helper
 *
 * Handles OAuth token exchange, refresh, and calendar API calls.
 */

import { env } from '$env/dynamic/private';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

// Full access scopes for calendar operations
const SCOPES = [
	'https://www.googleapis.com/auth/calendar.readonly', // List calendars
	'https://www.googleapis.com/auth/calendar.events' // Read/write events
];

export interface GoogleTokens {
	access_token: string;
	refresh_token: string;
	expires_at: Date;
}

export interface CalendarEvent {
	id: string;
	summary: string;
	start: { dateTime?: string; date?: string; timeZone?: string };
	end: { dateTime?: string; date?: string; timeZone?: string };
	description?: string;
	location?: string;
	attendees?: { email: string; responseStatus?: string }[];
	conferenceData?: {
		createRequest?: { requestId: string };
		entryPoints?: { entryPointType: string; uri: string }[];
	};
	recurrence?: string[];
	reminders?: {
		useDefault: boolean;
		overrides?: { method: string; minutes: number }[];
	};
	colorId?: string;
}

export interface CreateEventInput {
	summary: string;
	start: { dateTime?: string; date?: string; timeZone?: string };
	end: { dateTime?: string; date?: string; timeZone?: string };
	description?: string;
	location?: string;
	attendees?: { email: string }[];
	addGoogleMeet?: boolean;
	recurrence?: string[];
	reminders?: {
		useDefault: boolean;
		overrides?: { method: string; minutes: number }[];
	};
	colorId?: string;
}

export interface UpdateEventInput {
	summary?: string;
	start?: { dateTime?: string; date?: string; timeZone?: string };
	end?: { dateTime?: string; date?: string; timeZone?: string };
	description?: string;
	location?: string;
	attendees?: { email: string }[];
	recurrence?: string[];
	reminders?: {
		useDefault: boolean;
		overrides?: { method: string; minutes: number }[];
	};
	colorId?: string;
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
		const errorText = await calendarsResponse.text();
		console.error('Calendar list API error:', calendarsResponse.status, errorText);
		throw new Error(`Failed to fetch calendar list: ${calendarsResponse.status}`);
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

/**
 * Get the "work" calendar ID, or fallback to primary
 */
export async function getWorkCalendarId(accessToken: string): Promise<string> {
	const calendarsResponse = await fetch(`${CALENDAR_API_BASE}/users/me/calendarList`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (!calendarsResponse.ok) {
		return 'primary';
	}

	const calendarsData = await calendarsResponse.json();
	const workCalendar = calendarsData.items?.find(
		(cal: { summary: string }) => cal.summary.toLowerCase() === 'work'
	);

	return workCalendar?.id || 'primary';
}

/**
 * Create a new calendar event
 */
export async function createCalendarEvent(
	accessToken: string,
	calendarId: string,
	event: CreateEventInput
): Promise<CalendarEvent> {
	const body: Record<string, unknown> = {
		summary: event.summary,
		start: event.start,
		end: event.end
	};

	if (event.description) body.description = event.description;
	if (event.location) body.location = event.location;
	if (event.attendees) body.attendees = event.attendees;
	if (event.recurrence) body.recurrence = event.recurrence;
	if (event.reminders) body.reminders = event.reminders;
	if (event.colorId) body.colorId = event.colorId;

	// Google Meet integration
	if (event.addGoogleMeet) {
		body.conferenceData = {
			createRequest: {
				requestId: crypto.randomUUID()
			}
		};
	}

	const params = new URLSearchParams();
	if (event.addGoogleMeet) {
		params.set('conferenceDataVersion', '1');
	}

	const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events${params.toString() ? '?' + params : ''}`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to create event: ${error}`);
	}

	return response.json();
}

/**
 * Update an existing calendar event
 */
export async function updateCalendarEvent(
	accessToken: string,
	calendarId: string,
	eventId: string,
	updates: UpdateEventInput
): Promise<CalendarEvent> {
	const response = await fetch(
		`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
		{
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(updates)
		}
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to update event: ${error}`);
	}

	return response.json();
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(
	accessToken: string,
	calendarId: string,
	eventId: string
): Promise<void> {
	const response = await fetch(
		`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
		{
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${accessToken}`
			}
		}
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to delete event: ${error}`);
	}
}
