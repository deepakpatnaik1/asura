/**
 * Daily Backup Utility
 *
 * Triggers backup on first message of each day.
 * Non-blocking - runs in background after chat response.
 */

import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, BACKUP_API_KEY } from '$env/static/private';
import { createSimpleLogger } from './logger';

const log = createSimpleLogger('DailyBackup');

// Service role client for checking/updating backup date
const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Check if backup is needed today and trigger if so.
 * Called after each chat message - checks last_backup_date.
 */
export async function triggerDailyBackupIfNeeded(userId: string): Promise<void> {
	try {
		// Get today's date in Berlin timezone
		const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

		// Check last backup date
		const { data: settings, error: fetchError } = await supabase
			.from('user_settings')
			.select('last_backup_date')
			.eq('user_id', userId)
			.single();

		if (fetchError) {
			log.error('Failed to fetch settings', { error: fetchError.message });
			return;
		}

		const lastBackup = settings?.last_backup_date;

		// Skip if already backed up today
		if (lastBackup === today) {
			return;
		}

		log.info('Triggering daily backup', { userId, lastBackup, today });

		// Update last_backup_date first (to prevent duplicate backups)
		const { error: updateError } = await supabase
			.from('user_settings')
			.update({ last_backup_date: today })
			.eq('user_id', userId);

		if (updateError) {
			log.error('Failed to update backup date', { error: updateError.message });
			return;
		}

		// Call backup API (fire and forget)
		const baseUrl = process.env.VERCEL_URL
			? `https://${process.env.VERCEL_URL}`
			: 'http://localhost:5173';

		fetch(`${baseUrl}/api/backup`, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${BACKUP_API_KEY}`
			}
		}).then(async (response) => {
			if (response.ok) {
				const data = await response.json();
				log.info('Backup completed', {
					userCount: data.meta?.user_count,
					exportedAt: data.meta?.exported_at
				});
			} else {
				log.error('Backup API failed', { status: response.status });
			}
		}).catch((err) => {
			log.error('Backup request failed', { error: err.message });
		});

	} catch (error) {
		log.error('Backup check failed', {
			error: error instanceof Error ? error.message : 'Unknown'
		});
	}
}
