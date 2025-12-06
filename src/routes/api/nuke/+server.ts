import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError, internalError } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';

/**
 * Unified Nuke Endpoint
 *
 * POST /api/nuke
 * Body: {} (no parameters required)
 *
 * Deletes ALL conversation data:
 * 1. charts (superjournal + file charts, with storage cleanup)
 * 2. superjournal (cascades to journal)
 * 3. content (files/articles)
 * 4. todos, tags, founder_diary
 *
 * User settings are preserved.
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

		log.info('Starting nuke', { userId });

		// 2. FETCH ALL CHARTS FOR STORAGE CLEANUP
		const { data: superjournalCharts } = await supabase
			.from('charts')
			.select('storage_path, thumbnail_path')
			.eq('user_id', userId)
			.not('superjournal_id', 'is', null);

		const { data: fileCharts } = await supabase
			.from('charts')
			.select('storage_path, thumbnail_path')
			.eq('user_id', userId)
			.not('content_id', 'is', null);

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

		// 5. DELETE ALL CONTENT (files/articles)
		const { error: contentError } = await supabase
			.from('content')
			.delete()
			.eq('user_id', userId);

		if (contentError) {
			log.error('Failed to delete content', { error: contentError });
			return databaseError('Failed to delete content');
		}

		// 6. DELETE ALL SUPERJOURNAL (cascades to journal via FK)
		const { error: superjournalError } = await supabase
			.from('superjournal')
			.delete()
			.eq('user_id', userId);

		if (superjournalError) {
			log.error('Failed to delete superjournal', { error: superjournalError });
			return databaseError('Failed to delete superjournal data');
		}

		// 7. DELETE PRODUCTIVITY DATA (todos, tags, founder_diary)
		const { data: deletedTodos, error: todosError } = await supabase
			.from('todos')
			.delete()
			.eq('user_id', userId)
			.select('id');

		if (todosError) {
			log.error('Failed to delete todos', { error: todosError });
			return databaseError('Failed to delete todos');
		}
		const todosDeleted = deletedTodos?.length || 0;

		const { data: deletedTags, error: tagsError } = await supabase
			.from('tags')
			.delete()
			.eq('user_id', userId)
			.select('id');

		if (tagsError) {
			log.error('Failed to delete tags', { error: tagsError });
			return databaseError('Failed to delete tags');
		}
		const tagsDeleted = deletedTags?.length || 0;

		const { data: deletedDiary, error: diaryError } = await supabase
			.from('founder_diary')
			.delete()
			.eq('user_id', userId)
			.select('id');

		if (diaryError) {
			log.error('Failed to delete founder diary', { error: diaryError });
			return databaseError('Failed to delete founder diary');
		}
		const diaryDeleted = deletedDiary?.length || 0;

		// User settings are preserved - nuke only deletes conversation data

		log.info('Nuke complete', {
			superjournalCharts: superjournalCharts?.length || 0,
			fileCharts: fileCharts?.length || 0,
			storageFilesDeleted: storagePaths.length,
			todosDeleted,
			tagsDeleted,
			diaryDeleted
		});

		return json({
			success: true,
			message: 'All data has been deleted',
			deleted: {
				superjournal_charts: superjournalCharts?.length || 0,
				file_charts: fileCharts?.length || 0,
				storage_files: storagePaths.length,
				todos: todosDeleted,
				tags: tagsDeleted,
				diary: diaryDeleted
			}
		});
	} catch (error) {
		log.error('Nuke operation failed', { error });
		return internalError('Unexpected error during nuke operation');
	}
};
