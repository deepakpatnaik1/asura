/**
 * Stage Manager State API
 *
 * GET  - Fetch state + check for pending cron triggers
 * POST - Update state (dismiss flash, record talked to Felix, or check trigger manually)
 *
 * Flow:
 * 1. Edge Function runs at 9am, writes trigger to felix_cron_triggers (hosted Supabase)
 * 2. Aether client calls GET on page load / periodically
 * 3. GET checks for unprocessed triggers, counts pending emails + scans
 * 4. Returns should_show_flash: true with email_count + scan_count for Felix to review with Boss
 *
 * Note: No AI evaluation - Felix reviews correspondence manually with Boss
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/supabase-admin';
import { getHostedSupabase, isHostedSupabaseConfigured } from '$lib/supabase-hosted';
import { checkWatchedEmailsForFelix, checkScannedDocsForFelix } from '$lib/api/gmail-tools';
import { getPendingScanCount } from '$lib/api/scan-tools';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';
const GMAIL_USER_ID = '8288224b-40c0-41e3-aa30-5bd704533524';

/**
 * Count emails needing attention that haven't been addressed yet
 */
async function getPendingEmailCount(): Promise<number> {
	try {
		const { data: accounts, error: accountError } = await supabaseAdmin
			.from('gmail_accounts')
			.select('id')
			.eq('user_id', GMAIL_USER_ID);

		if (accountError || !accounts || accounts.length === 0) {
			return 0;
		}

		const accountIds = accounts.map(a => a.id);

		const { count, error } = await supabaseAdmin
			.from('gmail_processed')
			.select('*', { count: 'exact', head: true })
			.in('gmail_account_id', accountIds)
			.eq('needs_attention', true)
			.is('addressed_at', null);

		if (error) {
			console.error('[Stage Manager] Error counting pending emails:', error);
			return 0;
		}

		return count || 0;
	} catch (error) {
		console.error('[Stage Manager] Error in getPendingEmailCount:', error);
		return 0;
	}
}

/**
 * Determine if flash should show based on pending emails and dismiss timing
 *
 * Logic:
 * - 9am: scan runs, flash shows
 * - Boss dismisses: flash hides
 * - 1pm (4 hours after scan): flash re-appears (one re-ping)
 * - Boss dismisses again: flash hides until tomorrow's 9am scan
 */
function shouldShowFlash(
	pendingCount: number,
	lastEmailCheckAt: string | null,
	flashDismissedAt: string | null
): boolean {
	// No pending emails = no flash
	if (pendingCount === 0) return false;

	// No scan yet = no flash
	if (!lastEmailCheckAt) return false;

	// Never dismissed = show flash
	if (!flashDismissedAt) return true;

	const scanTime = new Date(lastEmailCheckAt);
	const dismissTime = new Date(flashDismissedAt);
	const now = new Date();
	const repingTime = new Date(scanTime.getTime() + 4 * 60 * 60 * 1000); // 4 hours after scan

	// Dismissed before this scan = show flash (new scan since dismiss)
	if (dismissTime < scanTime) return true;

	// We're past re-ping time (1pm window)
	if (now >= repingTime) {
		// Show if dismissed before re-ping time (hasn't dismissed the re-ping yet)
		return dismissTime < repingTime;
	}

	// We're in first window (9am-1pm), already dismissed = stay hidden
	return false;
}

/**
 * Check for unprocessed cron triggers and process them
 * Returns whether flash should be shown
 */
async function checkAndProcessTriggers(): Promise<{
	should_show_flash: boolean;
	email_count: number;
	scan_count: number;
	trigger_processed: boolean;
}> {
	// Skip if hosted Supabase not configured
	if (!isHostedSupabaseConfigured()) {
		return { should_show_flash: false, email_count: 0, scan_count: 0, trigger_processed: false };
	}

	try {
		const hostedSupabase = getHostedSupabase();

		// Check for unprocessed triggers
		const { data: triggers, error: triggerError } = await hostedSupabase
			.from('felix_cron_triggers')
			.select('id, trigger_type, triggered_at')
			.is('processed_at', null)
			.eq('trigger_type', 'daily_email_check')
			.order('triggered_at', { ascending: false })
			.limit(1);

		if (triggerError || !triggers || triggers.length === 0) {
			return { should_show_flash: false, email_count: 0, scan_count: 0, trigger_processed: false };
		}

		const trigger = triggers[0];
		console.log(`[Stage Manager] Processing trigger from ${trigger.triggered_at}`);

		// Count pending emails from watched senders (no AI evaluation - Felix reviews manually)
		const emailResult = await checkWatchedEmailsForFelix();

		// Count pending scanned documents (paper mail)
		const scanResult = await checkScannedDocsForFelix();

		// Mark trigger as processed regardless of scan results
		await hostedSupabase
			.from('felix_cron_triggers')
			.update({ processed_at: new Date().toISOString() })
			.eq('id', trigger.id);

		// Update local state
		await supabaseAdmin
			.from('stage_manager_state')
			.update({
				last_email_check_at: new Date().toISOString(),
				pending_email_check: false,
				updated_at: new Date().toISOString()
			})
			.eq('user_id', DEFAULT_USER_ID);

		if (emailResult.error) {
			console.error('[Stage Manager] Email scan error:', emailResult.error);
		}
		if (scanResult.error) {
			console.error('[Stage Manager] Scan check error:', scanResult.error);
		}

		const totalEmailCount = emailResult.emailCount || 0;
		const totalScanCount = scanResult.docCount || 0;

		console.log(`[Stage Manager] Felix found ${totalEmailCount} emails + ${totalScanCount} scanned docs needing attention`);
		return {
			should_show_flash: emailResult.hasEmailsNeedingAttention || scanResult.hasDocsNeedingAttention,
			email_count: totalEmailCount,
			scan_count: totalScanCount,
			trigger_processed: true
		};
	} catch (error) {
		console.error('[Stage Manager] Trigger processing error:', error);
		return { should_show_flash: false, email_count: 0, scan_count: 0, trigger_processed: false };
	}
}

export const GET: RequestHandler = async () => {
	try {
		// Get current state from local Supabase
		const { data, error } = await supabaseAdmin
			.from('stage_manager_state')
			.select('flash_dismissed_at, last_talked_to_felix_at, last_email_check_at')
			.eq('user_id', DEFAULT_USER_ID)
			.single();

		if (error) {
			console.error('Failed to fetch stage manager state:', error);
		}

		// Check for pending triggers (this may run an email + scan check)
		const triggerResult = await checkAndProcessTriggers();

		// Get pending counts
		const pendingEmailCount = triggerResult.trigger_processed
			? triggerResult.email_count
			: await getPendingEmailCount();
		const pendingScanCount = triggerResult.trigger_processed
			? triggerResult.scan_count
			: await getPendingScanCount();

		const totalPending = pendingEmailCount + pendingScanCount;

		// Determine if flash should show (respects dismiss + re-ping logic)
		const flashVisible = shouldShowFlash(
			totalPending,
			data?.last_email_check_at || null,
			data?.flash_dismissed_at || null
		);

		return json({
			flash_dismissed_at: data?.flash_dismissed_at || null,
			last_talked_to_felix_at: data?.last_talked_to_felix_at || null,
			last_email_check_at: data?.last_email_check_at || null,
			should_show_flash: flashVisible,
			email_count: pendingEmailCount,
			scan_count: pendingScanCount,
			trigger_processed: triggerResult.trigger_processed
		});
	} catch (err) {
		console.error('Stage manager GET error:', err);
		return json({
			flash_dismissed_at: null,
			last_talked_to_felix_at: null,
			last_email_check_at: null,
			should_show_flash: false,
			email_count: 0,
			scan_count: 0,
			trigger_processed: false
		});
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { action } = body;

		if (action === 'dismiss') {
			// Record when flash was dismissed
			const { error } = await supabaseAdmin
				.from('stage_manager_state')
				.update({
					flash_dismissed_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.eq('user_id', DEFAULT_USER_ID);

			if (error) {
				console.error('Failed to record dismiss:', error);
				return json({ success: false, error: error.message }, { status: 500 });
			}

			return json({ success: true });
		}

		if (action === 'talked') {
			// Record when Boss talked to Felix
			const { error } = await supabaseAdmin
				.from('stage_manager_state')
				.update({
					last_talked_to_felix_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.eq('user_id', DEFAULT_USER_ID);

			if (error) {
				console.error('Failed to record talked:', error);
				return json({ success: false, error: error.message }, { status: 500 });
			}

			return json({ success: true });
		}

		if (action === 'check_trigger') {
			// Manually trigger a check (for testing)
			const result = await checkAndProcessTriggers();
			return json({
				success: true,
				...result
			});
		}

		return json({ success: false, error: 'Unknown action' }, { status: 400 });
	} catch (err) {
		console.error('Stage manager POST error:', err);
		return json({ success: false, error: 'Internal error' }, { status: 500 });
	}
};
