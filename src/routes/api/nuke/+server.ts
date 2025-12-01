import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError, internalError } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';

/**
 * Chat Mode Nuke Endpoint
 *
 * POST /api/nuke
 * Deletes all chat mode data for the current user:
 * 1. charts (superjournal + file charts, with storage cleanup)
 * 2. superjournal (cascades to journal)
 * 3. files
 * 4. user_settings (reset)
 *
 * Response: { success: true, deleted: { ... } } or { error: { message, code } }
 */

export const POST: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const log = createLogger('NukeAPI');

	try {
		// 1. AUTHENTICATION CHECK
		const auth = await requireAuth(safeGetSession);
		if (!auth.success) return auth.error;
		const { userId } = auth;

		log.info('Starting chat mode nuke', { userId });

		// 2. FETCH CHARTS FOR STORAGE CLEANUP (superjournal + file charts)
		const { data: superjournalCharts } = await supabase
			.from('charts')
			.select('storage_path, thumbnail_path')
			.eq('user_id', userId)
			.not('superjournal_id', 'is', null);

		// Fetch content charts (chat mode content)
		const { data: fileCharts } = await supabase
			.from('charts')
			.select('storage_path, thumbnail_path, content!inner(mode)')
			.eq('user_id', userId)
			.not('content_id', 'is', null)
			.eq('content.mode', 'chat');

		// 3. COLLECT STORAGE PATHS
		const storagePaths: string[] = [];

		if (superjournalCharts && superjournalCharts.length > 0) {
			for (const chart of superjournalCharts) {
				if (chart.storage_path) {
					storagePaths.push(chart.storage_path);
				}
				if (chart.thumbnail_path) {
					storagePaths.push(chart.thumbnail_path);
				}
			}
		}

		if (fileCharts && fileCharts.length > 0) {
			for (const chart of fileCharts) {
				if (chart.storage_path) {
					storagePaths.push(chart.storage_path);
				}
				if (chart.thumbnail_path) {
					storagePaths.push(chart.thumbnail_path);
				}
			}
		}

		// 4. DELETE FROM SUPABASE STORAGE
		if (storagePaths.length > 0) {
			const { error: storageError } = await supabase.storage
				.from('content')
				.remove(storagePaths);
			if (storageError) {
				log.warn('Failed to delete chart files from storage', { error: storageError });
			}
		}

		// 5. DELETE CHARTS (superjournal + content charts for chat mode)
		// Note: CASCADE deletes will also handle this, but explicit delete ensures storage cleanup happened first
		const { error: chartsError } = await supabase
			.from('charts')
			.delete()
			.eq('user_id', userId)
			.or('superjournal_id.not.is.null,content_id.not.is.null');

		if (chartsError) {
			log.error('Failed to delete charts', { error: chartsError });
			return databaseError('Failed to delete charts');
		}

		// 6. DELETE CHAT CONTENT (files)
		const { error: contentError } = await supabase
			.from('content')
			.delete()
			.eq('user_id', userId)
			.eq('mode', 'chat');

		if (contentError) {
			log.error('Failed to delete content', { error: contentError });
			return databaseError('Failed to delete content');
		}

		// 7. DELETE SUPERJOURNAL (cascades to journal via FK)
		const { error: superjournalError } = await supabase
			.from('superjournal')
			.delete()
			.eq('user_id', userId);

		if (superjournalError) {
			log.error('Failed to delete superjournal', { error: superjournalError });
			return databaseError('Failed to delete superjournal data');
		}

		// 8. DELETE USER SETTINGS (reset)
		const { error: settingsError } = await supabase
			.from('user_settings')
			.delete()
			.eq('user_id', userId);

		if (settingsError) {
			log.error('Failed to delete settings', { error: settingsError });
			return databaseError('Failed to delete settings');
		}

		log.info('Chat mode nuke complete', {
			superjournalCharts: superjournalCharts?.length || 0,
			fileCharts: fileCharts?.length || 0,
			storageFilesDeleted: storagePaths.length
		});

		return json({
			success: true,
			message: 'All chat mode data has been deleted',
			deleted: {
				superjournal_charts: superjournalCharts?.length || 0,
				file_charts: fileCharts?.length || 0,
				storage_files: storagePaths.length
			}
		});
	} catch (error) {
		log.error('Nuke operation failed', { error });
		return internalError('Unexpected error during nuke operation');
	}
};
