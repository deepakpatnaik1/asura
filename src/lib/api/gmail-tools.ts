/**
 * Gmail Tools for Felix
 *
 * Tool definitions and executors for Gmail integration.
 * These tools allow Felix to monitor inboxes for money-related emails.
 */

import type Anthropic from '@anthropic-ai/sdk';
import {
	listMessages,
	getMessage,
	parseMessage,
	refreshGmailAccessToken,
	startWatch,
	stopWatch,
	getHistory,
	type ParsedEmail
} from './google-gmail';
import { supabaseAdmin } from '$lib/supabase-admin';
import { env } from '$env/dynamic/private';
import { createClient } from '@supabase/supabase-js';

// Pub/Sub topic for Gmail notifications
const GMAIL_PUBSUB_TOPIC = 'projects/tsushima-472819/topics/gmail-notifications';

// Auto-renewal threshold (renew if expiring within this many hours)
const WATCH_RENEWAL_THRESHOLD_HOURS = 24;

/**
 * Tool Definitions
 */

export const LIST_GMAIL_ACCOUNTS_TOOL: Anthropic.Tool = {
	name: 'list_gmail_accounts',
	description: 'List connected Gmail accounts. Shows which email accounts are linked to Aether.',
	input_schema: {
		type: 'object',
		properties: {},
		required: []
	}
};

export const READ_MESSAGE_TOOL: Anthropic.Tool = {
	name: 'read_gmail_message',
	description:
		'Read the full content of an email. Use this after scan_gmail_inbox to see the complete body, links, and details of a specific message. Requires the message_id from a previous scan.',
	input_schema: {
		type: 'object',
		properties: {
			message_id: {
				type: 'string',
				description: 'The Gmail message ID (from scan_gmail_inbox results or gmail_processed table)'
			}
		},
		required: ['message_id']
	}
};

export const START_WATCH_TOOL: Anthropic.Tool = {
	name: 'start_gmail_watch',
	description:
		'Start real-time email monitoring for a Gmail account. Gmail will push notifications when new emails arrive. Watch expires after 7 days and needs renewal. Use this to enable instant email alerts instead of manual scanning.',
	input_schema: {
		type: 'object',
		properties: {
			account_type: {
				type: 'string',
				enum: ['personal', 'company', 'all'],
				description: 'Which account to watch. Default: "all" (both accounts)'
			}
		},
		required: []
	}
};

export const STOP_WATCH_TOOL: Anthropic.Tool = {
	name: 'stop_gmail_watch',
	description: 'Stop real-time email monitoring for a Gmail account.',
	input_schema: {
		type: 'object',
		properties: {
			account_type: {
				type: 'string',
				enum: ['personal', 'company', 'all'],
				description: 'Which account to stop watching. Default: "all"'
			}
		},
		required: []
	}
};

export const CHECK_NOTIFICATIONS_TOOL: Anthropic.Tool = {
	name: 'check_gmail_notifications',
	description:
		'Check for new email notifications. Returns unprocessed push notifications from Gmail. Use this to see if any new emails arrived since the last check. After reviewing, use process_gmail_notification to fetch the actual emails.',
	input_schema: {
		type: 'object',
		properties: {
			limit: {
				type: 'number',
				description: 'Maximum notifications to return. Default: 10'
			}
		},
		required: []
	}
};

export const PROCESS_NOTIFICATION_TOOL: Anthropic.Tool = {
	name: 'process_gmail_notification',
	description:
		'Process a Gmail notification - fetches the new emails that triggered it and marks the notification as handled. Use after check_gmail_notifications to retrieve the actual email content.',
	input_schema: {
		type: 'object',
		properties: {
			notification_id: {
				type: 'string',
				description: 'The notification ID from check_gmail_notifications'
			}
		},
		required: ['notification_id']
	}
};

export const SCAN_STARRED_TOOL: Anthropic.Tool = {
	name: 'scan_starred_emails',
	description:
		'Scan for starred emails that Boss wants you to act on. Boss stars emails in Gmail to flag them for your attention. This finds all starred emails you haven\'t processed yet. Use this proactively to catch up on starred emails.',
	input_schema: {
		type: 'object',
		properties: {
			account_type: {
				type: 'string',
				enum: ['personal', 'company', 'all'],
				description: 'Which account to scan. Default: "all"'
			},
			max_results: {
				type: 'number',
				description: 'Maximum emails to return. Default: 20'
			}
		},
		required: []
	}
};

export const LIST_PENDING_EMAILS_TOOL: Anthropic.Tool = {
	name: 'list_pending_emails',
	description:
		'List emails that need Boss\'s attention but haven\'t been discussed yet. These are emails Felix flagged during daily scans that Boss hasn\'t addressed. Use this to see what\'s pending before starting a discussion.',
	input_schema: {
		type: 'object',
		properties: {},
		required: []
	}
};

export const MARK_EMAIL_ADDRESSED_TOOL: Anthropic.Tool = {
	name: 'mark_email_addressed',
	description:
		'Mark an email as addressed after discussing it with Boss. Use this when Boss says they\'ve handled an email or don\'t need to discuss it further. Removes it from the pending emails list.',
	input_schema: {
		type: 'object',
		properties: {
			message_id: {
				type: 'string',
				description: 'The Gmail message ID to mark as addressed'
			}
		},
		required: ['message_id']
	}
};

export const GMAIL_TOOLS: Anthropic.Tool[] = [
	SCAN_STARRED_TOOL,
	LIST_GMAIL_ACCOUNTS_TOOL,
	READ_MESSAGE_TOOL,
	START_WATCH_TOOL,
	STOP_WATCH_TOOL,
	CHECK_NOTIFICATIONS_TOOL,
	PROCESS_NOTIFICATION_TOOL,
	LIST_PENDING_EMAILS_TOOL,
	MARK_EMAIL_ADDRESSED_TOOL
];

/**
 * Scan tool names (paper mail) - routed through Gmail executor
 */
const SCAN_TOOL_NAMES = ['scan_paper_folder', 'list_pending_scans', 'read_scan', 'mark_scan_addressed'];

/**
 * Check if a tool name is a Gmail tool (includes scan tools)
 */
export function isGmailTool(toolName: string): boolean {
	return GMAIL_TOOLS.some((t) => t.name === toolName) || SCAN_TOOL_NAMES.includes(toolName);
}

/**
 * Tool Executor Context
 */
export interface GmailToolContext {
	userId: string;
}

/**
 * Tool Execution Results
 */
export interface GmailToolResult {
	success: boolean;
	message: string;
	data?: unknown;
}

/**
 * Execute a Gmail tool
 */
export async function executeGmailTool(
	toolName: string,
	input: Record<string, unknown>,
	context: GmailToolContext
): Promise<GmailToolResult> {
	const { userId } = context;

	switch (toolName) {
		case 'scan_starred_emails':
			return executeScanStarred(userId, input);

		case 'list_gmail_accounts':
			return executeListAccounts(userId);

		case 'read_gmail_message':
			return executeReadMessage(userId, input);

		case 'start_gmail_watch':
			return executeStartWatch(userId, input);

		case 'stop_gmail_watch':
			return executeStopWatch(userId, input);

		case 'check_gmail_notifications':
			return executeCheckNotifications(userId, input);

		case 'process_gmail_notification':
			return executeProcessNotification(userId, input);

		case 'list_pending_emails':
			return executeListPendingEmails(userId);

		case 'mark_email_addressed':
			return executeMarkEmailAddressed(userId, input);

		// Scan tools (paper mail) - delegate to scan-tools
		case 'scan_paper_folder':
		case 'list_pending_scans':
		case 'read_scan':
		case 'mark_scan_addressed': {
			const { executeScanTool } = await import('./scan-tools');
			const result = await executeScanTool(toolName, input);
			return {
				success: true,
				message: result
			};
		}

		default:
			return {
				success: false,
				message: `Unknown tool: ${toolName}`
			};
	}
}

/**
 * Get valid access token for a Gmail account (refresh if expired)
 */
async function getValidAccessToken(account: {
	id: string;
	access_token: string;
	refresh_token: string;
	token_expires_at: string;
}): Promise<string> {
	const expiresAt = new Date(account.token_expires_at);
	const now = new Date();

	// Token still valid (with 5 min buffer)
	if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
		return account.access_token;
	}

	// Refresh token
	const refreshed = await refreshGmailAccessToken(account.refresh_token);

	// Update in database
	await supabaseAdmin
		.from('gmail_accounts')
		.update({
			access_token: refreshed.access_token,
			token_expires_at: refreshed.expires_at.toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', account.id);

	return refreshed.access_token;
}

/**
 * List Gmail Accounts Executor
 */
async function executeListAccounts(userId: string): Promise<GmailToolResult> {
	try {
		const { data: accounts, error } = await supabaseAdmin
			.from('gmail_accounts')
			.select('id, email, account_type, created_at, watch_expiration')
			.eq('user_id', userId)
			.order('account_type');

		if (error) {
			return { success: false, message: `Failed to fetch accounts: ${error.message}` };
		}

		if (!accounts || accounts.length === 0) {
			return {
				success: true,
				message:
					'No Gmail accounts connected. Connect via /api/google/gmail/authorize?type=personal or ?type=company',
				data: { accounts: [] }
			};
		}

		const formatted = accounts.map((a) => ({
			email: a.email,
			type: a.account_type,
			connected_at: new Date(a.created_at).toLocaleDateString(),
			watch_active: a.watch_expiration ? new Date(a.watch_expiration) > new Date() : false
		}));

		return {
			success: true,
			message: `${accounts.length} Gmail account(s) connected.`,
			data: { accounts: formatted }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to list accounts: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Read Message Executor
 * Fetches the full content of a specific email
 */
async function executeReadMessage(
	userId: string,
	input: Record<string, unknown>
): Promise<GmailToolResult> {
	try {
		const messageId = input.message_id as string;

		if (!messageId) {
			return { success: false, message: 'message_id is required' };
		}

		// Find which account this message belongs to via gmail_processed
		const { data: processed, error: processedError } = await supabaseAdmin
			.from('gmail_processed')
			.select('gmail_account_id, subject, from_address')
			.eq('message_id', messageId)
			.single();

		if (processedError || !processed) {
			return {
				success: false,
				message: 'Message not found. Run scan_gmail_inbox first to index the message.'
			};
		}

		// Get the account with tokens
		const { data: account, error: accountError } = await supabaseAdmin
			.from('gmail_accounts')
			.select('id, email, account_type, access_token, refresh_token, token_expires_at, user_id')
			.eq('id', processed.gmail_account_id)
			.single();

		if (accountError || !account) {
			return { success: false, message: 'Gmail account not found' };
		}

		// Verify ownership
		if (account.user_id !== userId) {
			return { success: false, message: 'Message not found' };
		}

		// Get valid access token
		const accessToken = await getValidAccessToken(account);

		// Fetch the full message
		const fullMessage = await getMessage(accessToken, messageId);
		const parsed = parseMessage(fullMessage);

		// Strip HTML tags if body is HTML, keep it readable
		let cleanBody = parsed.body;
		if (cleanBody.includes('<html') || cleanBody.includes('<body') || cleanBody.includes('<div')) {
			// Basic HTML to text conversion
			cleanBody = cleanBody
				.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style blocks
				.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script blocks
				.replace(/<br\s*\/?>/gi, '\n') // BR to newline
				.replace(/<\/p>/gi, '\n\n') // P end to double newline
				.replace(/<\/div>/gi, '\n') // DIV end to newline
				.replace(/<\/tr>/gi, '\n') // TR end to newline
				.replace(/<\/td>/gi, '\t') // TD end to tab
				.replace(/<\/li>/gi, '\n') // LI end to newline
				.replace(/<li[^>]*>/gi, '• ') // LI start to bullet
				.replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)') // Links to text (url)
				.replace(/<[^>]+>/g, '') // Remove remaining tags
				.replace(/&nbsp;/g, ' ') // Non-breaking space
				.replace(/&amp;/g, '&') // Ampersand
				.replace(/&lt;/g, '<') // Less than
				.replace(/&gt;/g, '>') // Greater than
				.replace(/&quot;/g, '"') // Quote
				.replace(/&#\d+;/g, '') // Numeric entities
				.replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
				.trim();
		}

		// Format attachments
		const attachmentList = parsed.attachments.map((a) => ({
			filename: a.filename,
			type: a.mimeType,
			size_kb: Math.round(a.size / 1024)
		}));

		return {
			success: true,
			message: `Email from ${parsed.from.name || parsed.from.email}`,
			data: {
				from: parsed.from.name ? `${parsed.from.name} <${parsed.from.email}>` : parsed.from.email,
				to: parsed.to.map((t) => (t.name ? `${t.name} <${t.email}>` : t.email)).join(', '),
				subject: parsed.subject,
				date: parsed.date.toLocaleString('en-US', {
					weekday: 'short',
					month: 'short',
					day: 'numeric',
					year: 'numeric',
					hour: 'numeric',
					minute: '2-digit'
				}),
				body: cleanBody,
				attachments: attachmentList,
				has_attachments: attachmentList.length > 0,
				account: `${account.account_type} (${account.email})`
			}
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to read message: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Get hosted Supabase client for notifications
 * Notifications are stored in a separate hosted Supabase project
 */
function getHostedSupabase() {
	const url = env.HOSTED_SUPABASE_URL;
	const key = env.HOSTED_SUPABASE_SERVICE_KEY;

	if (!url || !key) {
		throw new Error(
			'HOSTED_SUPABASE_URL and HOSTED_SUPABASE_SERVICE_KEY must be configured for Gmail notifications'
		);
	}

	return createClient(url, key);
}

/**
 * Start Watch Executor
 * Enables real-time push notifications from Gmail
 */
async function executeStartWatch(
	userId: string,
	input: Record<string, unknown>
): Promise<GmailToolResult> {
	try {
		const accountType = (input.account_type as string) || 'all';

		// Get accounts
		let query = supabaseAdmin
			.from('gmail_accounts')
			.select('id, email, account_type, access_token, refresh_token, token_expires_at')
			.eq('user_id', userId);

		if (accountType !== 'all') {
			query = query.eq('account_type', accountType);
		}

		const { data: accounts, error } = await query;

		if (error || !accounts || accounts.length === 0) {
			return {
				success: false,
				message: 'No Gmail accounts connected. Connect an account first.'
			};
		}

		const results: { email: string; status: string; expires?: string }[] = [];

		for (const account of accounts) {
			try {
				const accessToken = await getValidAccessToken(account);
				const watchResult = await startWatch(accessToken, GMAIL_PUBSUB_TOPIC);

				// Update account with watch info
				await supabaseAdmin
					.from('gmail_accounts')
					.update({
						watch_expiration: new Date(parseInt(watchResult.expiration)).toISOString(),
						watch_history_id: watchResult.historyId,
						updated_at: new Date().toISOString()
					})
					.eq('id', account.id);

				const expiresAt = new Date(parseInt(watchResult.expiration));
				results.push({
					email: account.email,
					status: 'watching',
					expires: expiresAt.toLocaleDateString()
				});
			} catch (watchError) {
				results.push({
					email: account.email,
					status: `failed: ${watchError instanceof Error ? watchError.message : 'Unknown error'}`
				});
			}
		}

		const successCount = results.filter((r) => r.status === 'watching').length;

		return {
			success: successCount > 0,
			message:
				successCount === results.length
					? `Real-time monitoring enabled for ${successCount} account(s). Watch expires in ~7 days.`
					: `Enabled ${successCount}/${results.length} account(s).`,
			data: { accounts: results }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to start watch: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Stop Watch Executor
 */
async function executeStopWatch(
	userId: string,
	input: Record<string, unknown>
): Promise<GmailToolResult> {
	try {
		const accountType = (input.account_type as string) || 'all';

		let query = supabaseAdmin
			.from('gmail_accounts')
			.select('id, email, account_type, access_token, refresh_token, token_expires_at')
			.eq('user_id', userId);

		if (accountType !== 'all') {
			query = query.eq('account_type', accountType);
		}

		const { data: accounts, error } = await query;

		if (error || !accounts || accounts.length === 0) {
			return { success: false, message: 'No Gmail accounts found.' };
		}

		const results: { email: string; status: string }[] = [];

		for (const account of accounts) {
			try {
				const accessToken = await getValidAccessToken(account);
				await stopWatch(accessToken);

				// Clear watch info
				await supabaseAdmin
					.from('gmail_accounts')
					.update({
						watch_expiration: null,
						watch_history_id: null,
						updated_at: new Date().toISOString()
					})
					.eq('id', account.id);

				results.push({ email: account.email, status: 'stopped' });
			} catch (watchError) {
				results.push({
					email: account.email,
					status: `failed: ${watchError instanceof Error ? watchError.message : 'Unknown error'}`
				});
			}
		}

		return {
			success: true,
			message: `Stopped real-time monitoring for ${results.filter((r) => r.status === 'stopped').length} account(s).`,
			data: { accounts: results }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to stop watch: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Check Notifications Executor
 * Fetches unprocessed notifications from hosted Supabase
 */
async function executeCheckNotifications(
	userId: string,
	input: Record<string, unknown>
): Promise<GmailToolResult> {
	try {
		const limit = Math.min((input.limit as number) || 10, 50);

		// Get user's email addresses
		const { data: accounts } = await supabaseAdmin
			.from('gmail_accounts')
			.select('email')
			.eq('user_id', userId);

		if (!accounts || accounts.length === 0) {
			return {
				success: true,
				message: 'No Gmail accounts connected.',
				data: { notifications: [] }
			};
		}

		const emails = accounts.map((a) => a.email);

		// Query hosted Supabase for unprocessed notifications
		const hostedSupabase = getHostedSupabase();
		const { data: notifications, error } = await hostedSupabase
			.from('gmail_notifications')
			.select('id, email_address, history_id, created_at')
			.in('email_address', emails)
			.is('processed_at', null)
			.order('created_at', { ascending: false })
			.limit(limit);

		if (error) {
			return {
				success: false,
				message: `Failed to check notifications: ${error.message}`
			};
		}

		if (!notifications || notifications.length === 0) {
			return {
				success: true,
				message: 'No new notifications.',
				data: { notifications: [] }
			};
		}

		const formatted = notifications.map((n) => ({
			id: n.id,
			email: n.email_address,
			history_id: n.history_id,
			received: new Date(n.created_at).toLocaleString()
		}));

		return {
			success: true,
			message: `${notifications.length} new notification(s) waiting.`,
			data: { notifications: formatted }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to check notifications: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Process Notification Executor
 * Fetches new emails since the notification's history ID and marks it as processed
 */
async function executeProcessNotification(
	userId: string,
	input: Record<string, unknown>
): Promise<GmailToolResult> {
	try {
		const notificationId = input.notification_id as string;

		if (!notificationId) {
			return { success: false, message: 'notification_id is required' };
		}

		// Get the notification from hosted Supabase
		const hostedSupabase = getHostedSupabase();
		const { data: notification, error: notifError } = await hostedSupabase
			.from('gmail_notifications')
			.select('*')
			.eq('id', notificationId)
			.single();

		if (notifError || !notification) {
			return { success: false, message: 'Notification not found' };
		}

		// Get the local account for this email
		const { data: account, error: accountError } = await supabaseAdmin
			.from('gmail_accounts')
			.select('id, email, account_type, access_token, refresh_token, token_expires_at, watch_history_id, user_id')
			.eq('email', notification.email_address)
			.eq('user_id', userId)
			.single();

		if (accountError || !account) {
			return { success: false, message: 'Gmail account not found for this notification' };
		}

		// Get valid access token
		const accessToken = await getValidAccessToken(account);

		// Use the stored history ID as start point (from when watch was set up)
		const startHistoryId = account.watch_history_id || notification.history_id;

		// Fetch history changes
		const { history, historyId: newHistoryId } = await getHistory(accessToken, startHistoryId);

		// Collect new message IDs
		const newMessageIds = new Set<string>();
		for (const record of history) {
			if (record.messagesAdded) {
				for (const added of record.messagesAdded) {
					// Only include messages in INBOX
					if (added.message.labelIds?.includes('INBOX')) {
						newMessageIds.add(added.message.id);
					}
				}
			}
		}

		// Fetch and parse new messages — only surface STARRED emails
		const newEmails: ParsedEmail[] = [];
		let skippedCount = 0;

		for (const messageId of newMessageIds) {
			try {
				const fullMessage = await getMessage(accessToken, messageId);
				const parsed = parseMessage(fullMessage);

				// Only surface starred emails — everything else gets silently skipped
				const isStarred = fullMessage.labelIds?.includes('STARRED');

				if (isStarred) {
					newEmails.push(parsed);

					// Store in gmail_processed (only starred emails)
					await supabaseAdmin.from('gmail_processed').upsert({
						gmail_account_id: account.id,
						message_id: parsed.id,
						thread_id: parsed.threadId,
						from_address: parsed.from.email,
						from_name: parsed.from.name,
						subject: parsed.subject,
						snippet: parsed.snippet,
						received_at: parsed.date.toISOString(),
						attachments: parsed.attachments.map((a) => ({
							filename: a.filename,
							mimeType: a.mimeType,
							size: a.size
						}))
					}, { onConflict: 'gmail_account_id,message_id' });
				} else {
					skippedCount++;
				}
			} catch {
				// Message might have been deleted, skip
			}
		}

		// Update account's history ID for next time
		await supabaseAdmin
			.from('gmail_accounts')
			.update({
				watch_history_id: newHistoryId,
				updated_at: new Date().toISOString()
			})
			.eq('id', account.id);

		// Mark notification as processed in hosted Supabase
		await hostedSupabase
			.from('gmail_notifications')
			.update({ processed_at: new Date().toISOString() })
			.eq('id', notificationId);

		// Format results
		const formatted = newEmails.map((email) => ({
			message_id: email.id,
			from: email.from.name ? `${email.from.name} <${email.from.email}>` : email.from.email,
			subject: email.subject,
			date: email.date.toLocaleString(),
			snippet: email.snippet,
			has_attachments: email.attachments.length > 0
		}));

		if (formatted.length === 0) {
			const skippedMsg = skippedCount > 0
				? ` (${skippedCount} non-starred email(s) ignored)`
				: '';
			return {
				success: true,
				message: `No starred emails found.${skippedMsg}`,
				data: { emails: [], skipped: skippedCount }
			};
		}

		return {
			success: true,
			message: `Found ${formatted.length} starred email(s).${skippedCount > 0 ? ` (${skippedCount} non-starred ignored)` : ''}`,
			data: { emails: formatted, skipped: skippedCount }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to process notification: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Scan Starred Emails Executor
 * Proactively finds starred emails that haven't been processed yet
 */
async function executeScanStarred(
	userId: string,
	input: Record<string, unknown>
): Promise<GmailToolResult> {
	try {
		const accountType = (input.account_type as string) || 'all';
		const maxResults = Math.min((input.max_results as number) || 20, 50);

		// Get accounts
		let query = supabaseAdmin
			.from('gmail_accounts')
			.select('id, email, account_type, access_token, refresh_token, token_expires_at')
			.eq('user_id', userId);

		if (accountType !== 'all') {
			query = query.eq('account_type', accountType);
		}

		const { data: accounts, error } = await query;

		if (error || !accounts || accounts.length === 0) {
			return {
				success: true,
				message: 'No Gmail accounts connected.',
				data: { emails: [] }
			};
		}

		const allStarred: (ParsedEmail & {
			account_email: string;
			account_type: string;
			pdf_count?: number;
		})[] = [];

		for (const account of accounts) {
			try {
				const accessToken = await getValidAccessToken(account);

				// Search for starred emails
				const messageRefs = await listMessages(accessToken, 'is:starred', maxResults);

				for (const ref of messageRefs) {
					// Check if already processed
					const { data: existing } = await supabaseAdmin
						.from('gmail_processed')
						.select('id')
						.eq('gmail_account_id', account.id)
						.eq('message_id', ref.id)
						.single();

					if (existing) continue; // Already processed

					// Fetch full message
					const fullMessage = await getMessage(accessToken, ref.id);
					const parsed = parseMessage(fullMessage);

					// Count PDF attachments (use read_gmail_message for vision evaluation)
					const pdfCount = parsed.attachments.filter(
						(a) => a.mimeType === 'application/pdf'
					).length;

					allStarred.push({
						...parsed,
						account_email: account.email,
						account_type: account.account_type,
						pdf_count: pdfCount
					});

					// Store in gmail_processed
					await supabaseAdmin.from('gmail_processed').upsert({
						gmail_account_id: account.id,
						message_id: parsed.id,
						thread_id: parsed.threadId,
						from_address: parsed.from.email,
						from_name: parsed.from.name,
						subject: parsed.subject,
						snippet: parsed.snippet,
						received_at: parsed.date.toISOString(),
						attachments: parsed.attachments.map((a) => ({
							filename: a.filename,
							mimeType: a.mimeType,
							size: a.size
						}))
					}, { onConflict: 'gmail_account_id,message_id' });
				}
			} catch (accountError) {
				console.error(`Failed to scan starred for ${account.email}:`, accountError);
			}
		}

		// Sort by date, newest first
		allStarred.sort((a, b) => b.date.getTime() - a.date.getTime());

		const formatted = allStarred.map((email) => ({
			message_id: email.id,
			from: email.from.name ? `${email.from.name} <${email.from.email}>` : email.from.email,
			subject: email.subject,
			date: email.date.toLocaleString(),
			snippet: email.snippet,
			body: email.body, // Full email body
			account: `${email.account_type} (${email.account_email})`,
			has_attachments: email.attachments.length > 0,
			attachment_count: email.attachments.length,
			pdf_count: email.pdf_count || 0
		}));

		if (formatted.length === 0) {
			return {
				success: true,
				message: 'No new starred emails to process.',
				data: { emails: [] }
			};
		}

		return {
			success: true,
			message: `Found ${formatted.length} new starred email(s) to process.`,
			data: { emails: formatted }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to scan starred emails: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

// ============================================================================
// Auto-Renewal
// ============================================================================

/**
 * Check and renew Gmail watches that are expiring soon.
 * Call this opportunistically (e.g., on chat requests) to keep watches alive.
 * Runs silently - logs results but doesn't throw.
 */
export async function checkAndRenewGmailWatches(): Promise<void> {
	try {
		const thresholdTime = new Date();
		thresholdTime.setHours(thresholdTime.getHours() + WATCH_RENEWAL_THRESHOLD_HOURS);

		// Find accounts with watches expiring within threshold
		const { data: expiringAccounts, error } = await supabaseAdmin
			.from('gmail_accounts')
			.select('id, email, account_type, access_token, refresh_token, token_expires_at, watch_expiration')
			.not('watch_expiration', 'is', null)
			.lt('watch_expiration', thresholdTime.toISOString());

		if (error || !expiringAccounts || expiringAccounts.length === 0) {
			return; // No watches expiring soon
		}

		console.log(`[Gmail Watch] ${expiringAccounts.length} watch(es) expiring soon, renewing...`);

		for (const account of expiringAccounts) {
			try {
				const accessToken = await getValidAccessToken(account);
				const watchResult = await startWatch(accessToken, GMAIL_PUBSUB_TOPIC);

				await supabaseAdmin
					.from('gmail_accounts')
					.update({
						watch_expiration: new Date(parseInt(watchResult.expiration)).toISOString(),
						watch_history_id: watchResult.historyId,
						updated_at: new Date().toISOString()
					})
					.eq('id', account.id);

				console.log(`[Gmail Watch] Renewed watch for ${account.email}, expires ${new Date(parseInt(watchResult.expiration)).toLocaleDateString()}`);
			} catch (renewError) {
				console.error(`[Gmail Watch] Failed to renew ${account.email}:`, renewError);
			}
		}
	} catch (error) {
		console.error('[Gmail Watch] Auto-renewal check failed:', error);
	}
}

// ============================================================================
// Stage Manager Integration
// ============================================================================

const DEFAULT_USER_ID = '8288224b-40c0-41e3-aa30-5bd704533524';

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string {
	const parts = email.split('@');
	return parts.length > 1 ? parts[1].toLowerCase() : '';
}

/**
 * Learn a sender from a starred email - add to watched senders list
 */
async function learnSenderFromStarred(
	userId: string,
	senderEmail: string,
	senderName: string | undefined,
	messageId: string
): Promise<void> {
	const email = senderEmail.toLowerCase();
	const domain = extractDomain(email);

	// Validate email before inserting - prevent corrupted data
	if (!email.includes('@') || email.length < 5 || domain.length < 3) {
		console.error(`[Felix] Invalid email format, skipping: "${email}" (from message ${messageId})`);
		return;
	}

	// Check if already watching this sender
	const { data: existing } = await supabaseAdmin
		.from('felix_watched_senders')
		.select('id')
		.eq('user_id', userId)
		.eq('email_address', email)
		.single();

	if (existing) {
		console.log(`[Felix] Already watching sender: ${email}`);
		return;
	}

	// Add to watched senders
	const { error } = await supabaseAdmin.from('felix_watched_senders').insert({
		user_id: userId,
		email_address: email,
		email_domain: domain,
		sender_name: senderName,
		learned_from_message_id: messageId,
		match_mode: 'address' // Start with exact match, Boss can change to domain later
	});

	if (error) {
		console.error(`[Felix] Failed to add watched sender ${email}:`, error);
	} else {
		console.log(`[Felix] Learned new sender to watch: ${email}`);
	}
}

/**
 * Get all watched senders for a user
 */
async function getWatchedSenders(userId: string): Promise<string[]> {
	const { data, error } = await supabaseAdmin
		.from('felix_watched_senders')
		.select('email_address')
		.eq('user_id', userId)
		.eq('is_active', true);

	if (error || !data) {
		return [];
	}

	return data.map((s) => s.email_address);
}

// NOTE: Email evaluation removed - Felix now reviews correspondence manually with Boss
// The 9am cron just counts pending items, Felix directs Boss to the source

/**
 * Count pending emails from watched senders
 *
 * Flow:
 * 1. Check starred emails - learn any new senders to watch
 * 2. Scan ALL emails from watched senders (not just starred)
 * 3. Store basic metadata (no AI evaluation - Felix reviews manually with Boss)
 * 4. Return count of unaddressed emails
 */
export async function checkWatchedEmailsForFelix(): Promise<{
	hasEmailsNeedingAttention: boolean;
	emailCount: number;
	emails: Array<{
		from: string;
		subject: string;
	}>;
	error?: string;
}> {
	try {
		// Get all Gmail accounts
		const { data: accounts, error: accountError } = await supabaseAdmin
			.from('gmail_accounts')
			.select('id, email, account_type, access_token, refresh_token, token_expires_at')
			.eq('user_id', DEFAULT_USER_ID);

		if (accountError || !accounts || accounts.length === 0) {
			return { hasEmailsNeedingAttention: false, emailCount: 0, emails: [] };
		}

		// Step 1: Learn senders from any new starred emails
		for (const account of accounts) {
			try {
				const accessToken = await getValidAccessToken(account);
				const starredRefs = await listMessages(accessToken, 'is:starred', 10);

				for (const ref of starredRefs) {
					// Check if we've already processed this starred email for learning
					const { data: existing } = await supabaseAdmin
						.from('felix_watched_senders')
						.select('id')
						.eq('learned_from_message_id', ref.id)
						.single();

					if (existing) continue; // Already learned from this

					// Fetch the starred email to learn the sender
					const fullMessage = await getMessage(accessToken, ref.id);
					const parsed = parseMessage(fullMessage);

					// Learn this sender
					await learnSenderFromStarred(
						DEFAULT_USER_ID,
						parsed.from.email,
						parsed.from.name,
						parsed.id
					);
				}
			} catch (err) {
				console.error(`[Felix] Error learning from starred for ${account.email}:`, err);
			}
		}

		// Step 2: Get all watched senders
		const watchedSenders = await getWatchedSenders(DEFAULT_USER_ID);

		if (watchedSenders.length === 0) {
			console.log('[Felix] No watched senders yet');
			return { hasEmailsNeedingAttention: false, emailCount: 0, emails: [] };
		}

		console.log(`[Felix] Scanning emails from ${watchedSenders.length} watched senders`);

		// Step 3: Scan emails from watched senders - just store metadata, no evaluation
		const newEmails: Array<{ from: string; subject: string }> = [];

		for (const account of accounts) {
			try {
				const accessToken = await getValidAccessToken(account);

				// Search for emails from watched senders in the last 7 days
				for (const sender of watchedSenders) {
					const query = `from:${sender} newer_than:7d`;
					const messageRefs = await listMessages(accessToken, query, 20);

					for (const ref of messageRefs) {
						// Check if already processed
						const { data: existing } = await supabaseAdmin
							.from('gmail_processed')
							.select('id')
							.eq('gmail_account_id', account.id)
							.eq('message_id', ref.id)
							.single();

						if (existing) continue; // Already processed

						// Fetch full message
						const fullMessage = await getMessage(accessToken, ref.id);
						const parsed = parseMessage(fullMessage);

						console.log(`[Felix] New email from watched sender: "${parsed.subject}" from ${parsed.from.email}`);

						// Store in gmail_processed - mark as needing attention, Felix reviews manually
						await supabaseAdmin.from('gmail_processed').upsert({
							gmail_account_id: account.id,
							message_id: parsed.id,
							thread_id: parsed.threadId,
							from_address: parsed.from.email,
							from_name: parsed.from.name,
							subject: parsed.subject,
							snippet: parsed.snippet,
							received_at: parsed.date.toISOString(),
							attachments: parsed.attachments.map((a) => ({
								filename: a.filename,
								mimeType: a.mimeType,
								size: a.size
							})),
							needs_attention: true // All emails from watched senders need review
						}, { onConflict: 'gmail_account_id,message_id' });

						newEmails.push({
							from: parsed.from.name || parsed.from.email,
							subject: parsed.subject
						});
					}
				}
			} catch (err) {
				console.error(`[Felix] Error scanning ${account.email}:`, err);
			}
		}

		// Step 4: Count total pending (unaddressed) emails
		const accountIds = accounts.map((a) => a.id);
		const { count: pendingCount } = await supabaseAdmin
			.from('gmail_processed')
			.select('*', { count: 'exact', head: true })
			.in('gmail_account_id', accountIds)
			.eq('needs_attention', true)
			.is('addressed_at', null);

		const totalPending = pendingCount || 0;

		return {
			hasEmailsNeedingAttention: totalPending > 0,
			emailCount: totalPending,
			emails: newEmails // Only the NEW emails found this scan
		};
	} catch (error) {
		return {
			hasEmailsNeedingAttention: false,
			emailCount: 0,
			emails: [],
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

// Keep old function for backward compatibility but deprecate it
/** @deprecated Use checkWatchedEmailsForFelix instead */
export async function hasNewStarredEmails(): Promise<{
	hasNew: boolean;
	count: number;
	error?: string;
}> {
	const result = await checkWatchedEmailsForFelix();
	return {
		hasNew: result.hasEmailsNeedingAttention,
		count: result.emailCount,
		error: result.error
	};
}

// ============================================================================
// Email Management Tools (for Felix conversations)
// ============================================================================

/**
 * List pending emails that haven't been addressed yet
 */
async function executeListPendingEmails(userId: string): Promise<GmailToolResult> {
	try {
		// Get all gmail accounts for this user
		const { data: accounts, error: accountError } = await supabaseAdmin
			.from('gmail_accounts')
			.select('id')
			.eq('user_id', userId);

		if (accountError || !accounts || accounts.length === 0) {
			return {
				success: true,
				message: 'No Gmail accounts connected.',
				data: { alerts: [] }
			};
		}

		const accountIds = accounts.map((a) => a.id);

		// Get pending emails: needs_attention = true AND addressed_at IS NULL
		const { data: alerts, error } = await supabaseAdmin
			.from('gmail_processed')
			.select('message_id, from_address, from_name, subject, snippet, received_at, felix_evaluation')
			.in('gmail_account_id', accountIds)
			.eq('needs_attention', true)
			.is('addressed_at', null)
			.order('received_at', { ascending: false });

		if (error) {
			return {
				success: false,
				message: `Failed to fetch pending emails: ${error.message}`
			};
		}

		if (!alerts || alerts.length === 0) {
			return {
				success: true,
				message: 'No pending emails. All caught up!',
				data: { alerts: [] }
			};
		}

		// Format for Felix
		const formatted = alerts.map((a, i) => ({
			index: i + 1,
			message_id: a.message_id,
			from: a.from_name ? `${a.from_name} <${a.from_address}>` : a.from_address,
			subject: a.subject,
			snippet: a.snippet?.slice(0, 100),
			received: a.received_at,
			why_flagged: a.felix_evaluation
		}));

		return {
			success: true,
			message: `Found ${alerts.length} pending email(s) to discuss with Boss.`,
			data: { alerts: formatted }
		};
	} catch (error) {
		return {
			success: false,
			message: `Error listing pending emails: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Mark an email as addressed (discussed with Boss)
 */
async function executeMarkEmailAddressed(
	userId: string,
	input: Record<string, unknown>
): Promise<GmailToolResult> {
	const messageId = input.message_id as string;

	if (!messageId) {
		return {
			success: false,
			message: 'message_id is required'
		};
	}

	try {
		// Get all gmail accounts for this user
		const { data: accounts, error: accountError } = await supabaseAdmin
			.from('gmail_accounts')
			.select('id')
			.eq('user_id', userId);

		if (accountError || !accounts || accounts.length === 0) {
			return {
				success: false,
				message: 'No Gmail accounts connected.'
			};
		}

		const accountIds = accounts.map((a) => a.id);

		// Find and update the email
		const { data: updated, error } = await supabaseAdmin
			.from('gmail_processed')
			.update({ addressed_at: new Date().toISOString() })
			.in('gmail_account_id', accountIds)
			.eq('message_id', messageId)
			.eq('needs_attention', true)
			.is('addressed_at', null)
			.select('subject')
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return {
					success: false,
					message: 'Email not found or already addressed.'
				};
			}
			return {
				success: false,
				message: `Failed to mark email as addressed: ${error.message}`
			};
		}

		return {
			success: true,
			message: `Marked "${updated.subject}" as addressed.`,
			data: { message_id: messageId, subject: updated.subject }
		};
	} catch (error) {
		return {
			success: false,
			message: `Error marking email as addressed: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

// ============================================================================
// Scanned Document Counting (Paper Mail)
// ============================================================================

import { getPendingScanCount, getPendingScans } from './scan-tools';

/**
 * Count pending scanned documents
 * Called during the 9am cron alongside email scanning
 * No AI evaluation - Felix reviews documents manually with Boss
 */
export async function checkScannedDocsForFelix(): Promise<{
	hasDocsNeedingAttention: boolean;
	docCount: number;
	docs: Array<{ fileName: string }>;
	error?: string;
}> {
	try {
		const pendingScans = await getPendingScans();
		const pendingCount = pendingScans.length;

		return {
			hasDocsNeedingAttention: pendingCount > 0,
			docCount: pendingCount,
			docs: pendingScans.map((s) => ({ fileName: s.file_name }))
		};
	} catch (error) {
		console.error('[Felix] Scanned doc check error:', error);
		return {
			hasDocsNeedingAttention: false,
			docCount: 0,
			docs: [],
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

