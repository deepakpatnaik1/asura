import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export const GET: RequestHandler = async () => {
	try {
		const logPath = join(homedir(), 'backups/supabase/backup.log');
		const logContent = await readFile(logPath, 'utf-8');

		// Find the last successful backup line
		const lines = logContent.trim().split('\n').reverse();
		const successLine = lines.find(line => line.includes('Backup successful'));

		if (successLine) {
			// Extract timestamp from line like "Sun Dec 21 13:20:21 CET 2025: Backup successful - aether_20251221_132021.sql.gz (91K)"
			const match = successLine.match(/^(.+?): Backup successful/);
			if (match) {
				return json({ lastBackup: match[1], status: 'ok' });
			}
		}

		return json({ lastBackup: null, status: 'no_backups' });
	} catch (error) {
		// Log file doesn't exist or can't be read
		return json({ lastBackup: null, status: 'not_configured' });
	}
};
