import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '$lib/api/logger';

const BACKUP_SCHEMA_VERSION = '1.0.0';

/**
 * Backup endpoint for automated exports via cron/script.
 * Uses API key auth instead of user session.
 * Returns all users' data in a single JSON response.
 */
export const GET: RequestHandler = async ({ request }) => {
	const log = createLogger('BackupAPI');

	// 1. API KEY AUTH
	const authHeader = request.headers.get('Authorization');
	const providedKey = authHeader?.replace('Bearer ', '');

	if (!env.BACKUP_API_KEY) {
		log.error('BACKUP_API_KEY not configured');
		return json({ error: 'Backup not configured' }, { status: 500 });
	}

	if (!providedKey || providedKey !== env.BACKUP_API_KEY) {
		log.warn('Invalid backup API key');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	log.info('Starting automated backup');

	try {
		// 2. CREATE SERVICE ROLE CLIENT (bypasses RLS)
		const supabase = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY!);

		// 3. GET ALL USERS
		const { data: users, error: usersError } = await supabase
			.from('user_settings')
			.select('user_id');

		if (usersError) {
			log.error('Failed to fetch users', { error: usersError });
			return json({ error: 'Failed to fetch users' }, { status: 500 });
		}

		// 4. EXPORT DATA FOR EACH USER
		const exports: Record<string, unknown> = {};

		for (const user of users || []) {
			const userId = user.user_id;

			const [
				superjournalResult,
				chartsResult,
				journalResult,
				contentResult,
				settingsResult,
				todosResult,
				diaryResult,
				tagsResult
			] = await Promise.all([
				supabase
					.from('superjournal')
					.select('*')
					.eq('user_id', userId)
					.order('created_at', { ascending: false }),
				supabase
					.from('charts')
					.select('*')
					.eq('user_id', userId)
					.order('created_at', { ascending: false }),
				supabase
					.from('journal')
					.select('*')
					.eq('user_id', userId)
					.order('created_at', { ascending: false }),
				supabase
					.from('content')
					.select('*')
					.eq('user_id', userId)
					.order('created_at', { ascending: false }),
				supabase
					.from('user_settings')
					.select('*')
					.eq('user_id', userId)
					.single(),
				supabase
					.from('todos')
					.select('*')
					.eq('user_id', userId)
					.order('created_at', { ascending: false }),
				supabase
					.from('founder_diary')
					.select('*')
					.eq('user_id', userId)
					.order('logged_at', { ascending: false }),
				supabase
					.from('tags')
					.select('*')
					.eq('user_id', userId)
					.order('name', { ascending: true })
			]);

			exports[userId] = {
				superjournal: superjournalResult.data || [],
				charts: chartsResult.data || [],
				journal: journalResult.data || [],
				content: contentResult.data || [],
				todos: todosResult.data || [],
				founder_diary: diaryResult.data || [],
				tags: tagsResult.data || [],
				settings: settingsResult.data || null,
				counts: {
					superjournal: superjournalResult.data?.length || 0,
					charts: chartsResult.data?.length || 0,
					journal: journalResult.data?.length || 0,
					content: contentResult.data?.length || 0,
					todos: todosResult.data?.length || 0,
					founder_diary: diaryResult.data?.length || 0,
					tags: tagsResult.data?.length || 0
				}
			};
		}

		// 5. BUILD RESPONSE
		const backupData = {
			meta: {
				schema_version: BACKUP_SCHEMA_VERSION,
				exported_at: new Date().toISOString(),
				user_count: users?.length || 0
			},
			users: exports
		};

		log.info('Backup complete', { userCount: users?.length || 0 });

		return new Response(JSON.stringify(backupData, null, 2), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="asura-backup-${new Date().toISOString().split('T')[0]}.json"`
			}
		});
	} catch (error) {
		log.error('Backup failed', { error });
		return json({ error: 'Backup failed' }, { status: 500 });
	}
};
