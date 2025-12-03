import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError, internalError, validationError } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';
import { modeSchema } from '$lib/schemas';

/**
 * Mode-Aware Nuke Endpoint
 *
 * POST /api/nuke
 * Body: { mode: 'chat' | 'reader' }
 *
 * Deletes all conversation data for the specified mode only:
 * 1. charts (superjournal + file charts, with storage cleanup)
 * 2. superjournal (cascades to journal for chat mode)
 * 3. content (files/articles)
 *
 * User settings are preserved.
 *
 * CRITICAL: Mode param is required. Each mode's data is strictly isolated.
 *
 * Response: { success: true, deleted: { ... } } or { error: { message, code } }
 */

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const log = createLogger('NukeAPI');

	try {
		// 1. AUTHENTICATION CHECK
		const auth = await requireAuth(safeGetSession);
		if (!auth.success) return auth.error;
		const { userId } = auth;

		// 2. VALIDATE MODE PARAM
		const body = await request.json();
		const modeResult = modeSchema.safeParse(body.mode);
		if (!modeResult.success) {
			return validationError('mode parameter is required (chat or reader)');
		}
		const mode = modeResult.data;

		log.info('Starting nuke', { userId, mode });

		// 3. FETCH CHARTS FOR STORAGE CLEANUP (superjournal + file charts for this mode)
		const { data: superjournalCharts } = await supabase
			.from('charts')
			.select('storage_path, thumbnail_path, superjournal!inner(mode)')
			.eq('user_id', userId)
			.not('superjournal_id', 'is', null)
			.eq('superjournal.mode', mode);

		// Fetch content charts (content for this mode)
		const { data: fileCharts } = await supabase
			.from('charts')
			.select('storage_path, thumbnail_path, content!inner(mode)')
			.eq('user_id', userId)
			.not('content_id', 'is', null)
			.eq('content.mode', mode);

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

		// 5. Charts will be cascade-deleted when superjournal/content are deleted
		// Storage cleanup already happened above

		// 6. DELETE CONTENT (files/articles) for this mode
		const { error: contentError } = await supabase
			.from('content')
			.delete()
			.eq('user_id', userId)
			.eq('mode', mode);

		if (contentError) {
			log.error('Failed to delete content', { error: contentError });
			return databaseError('Failed to delete content');
		}

		// 7. DELETE SUPERJOURNAL for this mode (cascades to journal via FK for chat mode)
		const { error: superjournalError } = await supabase
			.from('superjournal')
			.delete()
			.eq('user_id', userId)
			.eq('mode', mode);

		if (superjournalError) {
			log.error('Failed to delete superjournal', { error: superjournalError });
			return databaseError('Failed to delete superjournal data');
		}

		// User settings are preserved - nuke only deletes conversation data

		log.info('Nuke complete', {
			mode,
			superjournalCharts: superjournalCharts?.length || 0,
			fileCharts: fileCharts?.length || 0,
			storageFilesDeleted: storagePaths.length
		});

		return json({
			success: true,
			message: `All ${mode} mode data has been deleted`,
			deleted: {
				mode,
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
