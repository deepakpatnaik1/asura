/**
 * Google Gmail OAuth & API Helper
 *
 * Handles OAuth token exchange, refresh, and Gmail API calls.
 * Supports multiple accounts per user (personal + company).
 */

import { env } from '$env/dynamic/private';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

// Gmail scopes for reading, labeling, and modifying messages
const SCOPES = [
	'https://www.googleapis.com/auth/gmail.readonly', // Read emails
	'https://www.googleapis.com/auth/gmail.labels', // Create/manage labels
	'https://www.googleapis.com/auth/gmail.modify', // Mark read, apply labels
	'https://www.googleapis.com/auth/userinfo.email' // Get user's email address
];

export interface GmailTokens {
	access_token: string;
	refresh_token: string;
	expires_at: Date;
	email: string;
}

export interface GmailMessage {
	id: string;
	threadId: string;
	labelIds: string[];
	snippet: string;
	internalDate: string; // Unix timestamp in milliseconds (string)
	payload: {
		headers: { name: string; value: string }[];
		mimeType: string;
		body?: { data?: string; size: number };
		parts?: GmailMessagePart[];
	};
}

export interface GmailMessagePart {
	partId: string;
	mimeType: string;
	filename: string;
	headers: { name: string; value: string }[];
	body: { attachmentId?: string; data?: string; size: number };
	parts?: GmailMessagePart[];
}

export interface GmailAttachment {
	filename: string;
	mimeType: string;
	size: number;
	attachmentId: string;
	data?: string; // Base64 encoded when fetched
}

export interface ParsedEmail {
	id: string;
	threadId: string;
	from: { email: string; name?: string };
	to: { email: string; name?: string }[];
	subject: string;
	snippet: string;
	date: Date;
	labels: string[];
	body: string; // Plain text or HTML
	attachments: GmailAttachment[];
}

/**
 * Generate the Google OAuth authorization URL for Gmail
 */
export function getGmailAuthorizationUrl(redirectUri: string, state?: string): string {
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
 * Exchange authorization code for tokens and get user's email
 */
export async function exchangeGmailCodeForTokens(
	code: string,
	redirectUri: string
): Promise<GmailTokens> {
	const clientId = env.GOOGLE_CLIENT_ID;
	const clientSecret = env.GOOGLE_CLIENT_SECRET;
	if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured');

	// Exchange code for tokens
	const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
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

	if (!tokenResponse.ok) {
		const error = await tokenResponse.text();
		throw new Error(`Token exchange failed: ${error}`);
	}

	const tokenData = await tokenResponse.json();

	// Fetch user's email address
	const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
		headers: { Authorization: `Bearer ${tokenData.access_token}` }
	});

	if (!profileResponse.ok) {
		throw new Error('Failed to fetch user profile');
	}

	const profile = await profileResponse.json();

	return {
		access_token: tokenData.access_token,
		refresh_token: tokenData.refresh_token,
		expires_at: new Date(Date.now() + tokenData.expires_in * 1000),
		email: profile.email
	};
}

/**
 * Refresh access token using refresh token
 */
export async function refreshGmailAccessToken(refreshToken: string): Promise<{
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
 * List messages matching a query
 */
export async function listMessages(
	accessToken: string,
	query: string,
	maxResults: number = 20
): Promise<{ id: string; threadId: string }[]> {
	const params = new URLSearchParams({
		q: query,
		maxResults: maxResults.toString()
	});

	const response = await fetch(`${GMAIL_API_BASE}/users/me/messages?${params}`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to list messages: ${error}`);
	}

	const data = await response.json();
	return data.messages || [];
}

/**
 * Get a single message with full details
 */
export async function getMessage(accessToken: string, messageId: string): Promise<GmailMessage> {
	const response = await fetch(`${GMAIL_API_BASE}/users/me/messages/${messageId}?format=full`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to get message: ${error}`);
	}

	return response.json();
}

/**
 * Get attachment data
 */
export async function getAttachment(
	accessToken: string,
	messageId: string,
	attachmentId: string
): Promise<string> {
	const response = await fetch(
		`${GMAIL_API_BASE}/users/me/messages/${messageId}/attachments/${attachmentId}`,
		{
			headers: { Authorization: `Bearer ${accessToken}` }
		}
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to get attachment: ${error}`);
	}

	const data = await response.json();
	return data.data; // Base64 encoded
}

/**
 * Parse a Gmail message into a more usable format
 */
export function parseMessage(message: GmailMessage): ParsedEmail {
	const headers = message.payload.headers;
	const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

	// Parse From header with validation
	const fromRaw = getHeader('From');
	const fromMatch = fromRaw.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
	let fromEmail = fromMatch?.[2]?.trim() || fromRaw;
	let fromName = fromMatch?.[1]?.trim();

	// Validate extracted email - must contain @ and be reasonable length
	const isValidEmail = (email: string) => email.includes('@') && email.length >= 5;

	if (!isValidEmail(fromEmail)) {
		// Fallback: extract any email-like pattern from the raw header
		const emailFallback = fromRaw.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
		if (emailFallback) {
			fromEmail = emailFallback[0];
			// If we found email in raw string, the "name" part might actually be the name
			// Remove the email from raw to get remaining as name
			const remaining = fromRaw.replace(emailFallback[0], '').replace(/[<>"]/g, '').trim();
			if (remaining && !fromName) {
				fromName = remaining;
			}
		} else {
			// Last resort: use raw as email
			fromEmail = fromRaw;
		}
	}

	const from = {
		name: fromName,
		email: fromEmail
	};

	// Parse To header
	const toRaw = getHeader('To');
	const to = toRaw.split(',').map((addr) => {
		const match = addr.trim().match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
		return {
			name: match?.[1]?.trim(),
			email: match?.[2]?.trim() || addr.trim()
		};
	});

	// Extract body
	let body = '';
	const extractBody = (part: GmailMessagePart | GmailMessage['payload']): string => {
		if (part.body?.data) {
			return Buffer.from(part.body.data, 'base64').toString('utf-8');
		}
		if (part.parts) {
			// Prefer plain text, fall back to HTML
			const textPart = part.parts.find((p) => p.mimeType === 'text/plain');
			if (textPart) return extractBody(textPart);
			const htmlPart = part.parts.find((p) => p.mimeType === 'text/html');
			if (htmlPart) return extractBody(htmlPart);
			// Recurse into multipart
			for (const p of part.parts) {
				const result = extractBody(p);
				if (result) return result;
			}
		}
		return '';
	};
	body = extractBody(message.payload);

	// Extract attachments
	const attachments: GmailAttachment[] = [];
	const extractAttachments = (part: GmailMessagePart) => {
		if (part.filename && part.body.attachmentId) {
			attachments.push({
				filename: part.filename,
				mimeType: part.mimeType,
				size: part.body.size,
				attachmentId: part.body.attachmentId
			});
		}
		if (part.parts) {
			part.parts.forEach(extractAttachments);
		}
	};
	if (message.payload.parts) {
		message.payload.parts.forEach(extractAttachments);
	}

	return {
		id: message.id,
		threadId: message.threadId,
		from,
		to,
		subject: getHeader('Subject'),
		snippet: message.snippet,
		date: new Date(parseInt(message.internalDate)),
		labels: message.labelIds,
		body,
		attachments
	};
}

/**
 * Create or get a label by name
 */
export async function getOrCreateLabel(accessToken: string, labelName: string): Promise<string> {
	// First, try to find existing label
	const listResponse = await fetch(`${GMAIL_API_BASE}/users/me/labels`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (!listResponse.ok) {
		throw new Error('Failed to list labels');
	}

	const { labels } = await listResponse.json();
	const existing = labels?.find(
		(l: { name: string }) => l.name.toLowerCase() === labelName.toLowerCase()
	);

	if (existing) {
		return existing.id;
	}

	// Create new label
	const createResponse = await fetch(`${GMAIL_API_BASE}/users/me/labels`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ name: labelName })
	});

	if (!createResponse.ok) {
		const error = await createResponse.text();
		throw new Error(`Failed to create label: ${error}`);
	}

	const newLabel = await createResponse.json();
	return newLabel.id;
}

/**
 * Apply a label to a message
 */
export async function applyLabel(
	accessToken: string,
	messageId: string,
	labelId: string
): Promise<void> {
	const response = await fetch(`${GMAIL_API_BASE}/users/me/messages/${messageId}/modify`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ addLabelIds: [labelId] })
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to apply label: ${error}`);
	}
}

/**
 * Build a Gmail search query from watch rules
 */
export function buildSearchQuery(senderPatterns: string[], afterDate?: Date): string {
	const fromClauses = senderPatterns.map((pattern) => `from:${pattern}`).join(' OR ');
	let query = `(${fromClauses})`;

	if (afterDate) {
		const dateStr = afterDate.toISOString().split('T')[0].replace(/-/g, '/');
		query += ` after:${dateStr}`;
	}

	return query;
}

// ============================================================================
// Gmail Push Notifications (Watch API)
// ============================================================================

export interface WatchResponse {
	historyId: string;
	expiration: string; // Unix timestamp in milliseconds
}

export interface HistoryRecord {
	id: string;
	messages?: { id: string; threadId: string }[];
	messagesAdded?: { message: { id: string; threadId: string; labelIds: string[] } }[];
	messagesDeleted?: { message: { id: string; threadId: string } }[];
	labelsAdded?: { message: { id: string; threadId: string }; labelIds: string[] }[];
	labelsRemoved?: { message: { id: string; threadId: string }; labelIds: string[] }[];
}

/**
 * Start watching a Gmail mailbox for changes.
 * Notifications are sent to the specified Pub/Sub topic.
 * Watch expires after 7 days and must be renewed.
 *
 * @param accessToken - OAuth access token
 * @param topicName - Full Pub/Sub topic path (e.g., projects/tsushima-472819/topics/gmail-notifications)
 * @param labelIds - Optional label IDs to filter (default: INBOX)
 */
export async function startWatch(
	accessToken: string,
	topicName: string,
	labelIds: string[] = ['INBOX']
): Promise<WatchResponse> {
	const response = await fetch(`${GMAIL_API_BASE}/users/me/watch`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			topicName,
			labelIds,
			labelFilterBehavior: 'INCLUDE'
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to start watch: ${error}`);
	}

	return response.json();
}

/**
 * Stop watching a Gmail mailbox.
 */
export async function stopWatch(accessToken: string): Promise<void> {
	const response = await fetch(`${GMAIL_API_BASE}/users/me/stop`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to stop watch: ${error}`);
	}
}

/**
 * Get mailbox history since a given history ID.
 * Used to fetch changes after receiving a Pub/Sub notification.
 *
 * @param accessToken - OAuth access token
 * @param startHistoryId - History ID from watch response or last notification
 * @param labelId - Optional label to filter changes (default: INBOX)
 */
export async function getHistory(
	accessToken: string,
	startHistoryId: string,
	labelId: string = 'INBOX'
): Promise<{ history: HistoryRecord[]; historyId: string }> {
	const params = new URLSearchParams({
		startHistoryId,
		labelId,
		historyTypes: 'messageAdded'
	});

	const response = await fetch(`${GMAIL_API_BASE}/users/me/history?${params}`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (!response.ok) {
		// 404 means history ID is too old — need full sync
		if (response.status === 404) {
			return { history: [], historyId: startHistoryId };
		}
		const error = await response.text();
		throw new Error(`Failed to get history: ${error}`);
	}

	const data = await response.json();
	return {
		history: data.history || [],
		historyId: data.historyId
	};
}
