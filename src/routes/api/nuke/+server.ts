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
 * 1. superjournal_charts (+ storage files)
 * 2. superjournal (cascades to journal)
 * 3. file_charts (+ storage files)
 * 4. files
 * 5. user_settings (reset)
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

		// 2. FETCH SUPERJOURNAL CHARTS FOR STORAGE CLEANUP
		const { data: superjournalCharts } = await supabase
			.from('superjournal_charts')
			.select('storage_path, thumbnail_path')
			.eq('user_id', userId);

		// 3. FETCH FILE CHARTS FOR STORAGE CLEANUP
		const { data: fileCharts } = await supabase
			.from('file_charts')
			.select('storage_path, thumbnail_path')
			.eq('user_id', userId);

		// 4. COLLECT STORAGE PATHS
		const articlesBucketPaths: string[] = []; // superjournal charts use 'articles' bucket
		const filesBucketPaths: string[] = []; // file charts use 'files' bucket

		if (superjournalCharts && superjournalCharts.length > 0) {
			for (const chart of superjournalCharts) {
				if (chart.storage_path) {
					articlesBucketPaths.push(chart.storage_path);
				}
				if (chart.thumbnail_path) {
					articlesBucketPaths.push(chart.thumbnail_path);
				}
			}
		}

		if (fileCharts && fileCharts.length > 0) {
			for (const chart of fileCharts) {
				if (chart.storage_path) {
					filesBucketPaths.push(chart.storage_path);
				}
				if (chart.thumbnail_path) {
					filesBucketPaths.push(chart.thumbnail_path);
				}
			}
		}

		// 5. DELETE FROM SUPABASE STORAGE
		if (articlesBucketPaths.length > 0) {
			const { error: storageError } = await supabase.storage
				.from('articles')
				.remove(articlesBucketPaths);
			if (storageError) {
				log.warn('Failed to delete superjournal chart files', { error: storageError });
			}
		}

		if (filesBucketPaths.length > 0) {
			const { error: storageError } = await supabase.storage
				.from('files')
				.remove(filesBucketPaths);
			if (storageError) {
				log.warn('Failed to delete file chart files', { error: storageError });
			}
		}

		// 6. DELETE SUPERJOURNAL CHARTS (before superjournal due to FK)
		const { error: superjournalChartsError } = await supabase
			.from('superjournal_charts')
			.delete()
			.eq('user_id', userId);

		if (superjournalChartsError) {
			log.error('Failed to delete superjournal_charts', { error: superjournalChartsError });
			return databaseError('Failed to delete superjournal charts');
		}

		// 7. DELETE FILE CHARTS (before files due to FK)
		const { error: fileChartsError } = await supabase
			.from('file_charts')
			.delete()
			.eq('user_id', userId);

		if (fileChartsError) {
			log.error('Failed to delete file_charts', { error: fileChartsError });
			return databaseError('Failed to delete file charts');
		}

		// 8. DELETE FILES
		const { error: filesError } = await supabase
			.from('files')
			.delete()
			.eq('user_id', userId);

		if (filesError) {
			log.error('Failed to delete files', { error: filesError });
			return databaseError('Failed to delete files');
		}

		// 9. DELETE SUPERJOURNAL (cascades to journal via FK)
		const { error: superjournalError } = await supabase
			.from('superjournal')
			.delete()
			.eq('user_id', userId);

		if (superjournalError) {
			log.error('Failed to delete superjournal', { error: superjournalError });
			return databaseError('Failed to delete superjournal data');
		}

		// 10. DELETE USER SETTINGS (reset)
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
			storageFilesDeleted: articlesBucketPaths.length + filesBucketPaths.length
		});

		return json({
			success: true,
			message: 'All chat mode data has been deleted',
			deleted: {
				superjournal_charts: superjournalCharts?.length || 0,
				file_charts: fileCharts?.length || 0,
				storage_files: articlesBucketPaths.length + filesBucketPaths.length
			}
		});
	} catch (error) {
		log.error('Nuke operation failed', { error });
		return internalError('Unexpected error during nuke operation');
	}
};
