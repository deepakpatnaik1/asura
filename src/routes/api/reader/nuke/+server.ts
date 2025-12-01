import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';

/**
 * Reader Mode Nuke Endpoint
 *
 * POST /api/reader/nuke
 * Deletes all reader mode data for the current user:
 * 1. charts (article charts, with storage cleanup)
 * 2. articles
 *
 * Response: { success: true, deleted: number } or { error: { message, code } }
 */

export const POST: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const log = createLogger('ReaderNukeAPI');

	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	log.info('Starting reader mode nuke', { userId });

	// 2. FETCH ALL ARTICLES TO GET IDs
	const { data: articles, error: articlesFetchError } = await supabase
		.from('content')
		.select('id')
		.eq('user_id', userId)
		.eq('mode', 'reader');

	if (articlesFetchError) {
		log.warn('Failed to fetch articles for cleanup', { error: articlesFetchError });
	}

	// 3. FETCH ALL ARTICLE CHARTS TO GET FILE PATHS (reader mode content)
	const { data: articleCharts, error: chartsFetchError } = await supabase
		.from('charts')
		.select('storage_path, thumbnail_path, content!inner(mode)')
		.eq('user_id', userId)
		.not('content_id', 'is', null)
		.eq('content.mode', 'reader');

	if (chartsFetchError) {
		log.warn('Failed to fetch article charts for cleanup', { error: chartsFetchError });
	}

	// 4. COLLECT ALL STORAGE PATHS (stored as-is: images/... or thumbnails/...)
	const storagePaths: string[] = [];

	if (articleCharts && articleCharts.length > 0) {
		for (const chart of articleCharts) {
			if (chart.storage_path) storagePaths.push(chart.storage_path);
			if (chart.thumbnail_path) storagePaths.push(chart.thumbnail_path);
		}
	}

	// 5. DELETE FROM SUPABASE STORAGE (single content bucket)
	if (storagePaths.length > 0) {
		const { error } = await supabase.storage.from('content').remove(storagePaths);
		if (error) log.warn('Failed to delete from storage', { error });
	}

	// 6. DELETE ALL READER CONTENT FROM DATABASE (CASCADE handles charts via FK)
	const { error: deleteError } = await supabase
		.from('content')
		.delete()
		.eq('user_id', userId)
		.eq('mode', 'reader');

	if (deleteError) {
		log.error('Failed to delete articles', { error: deleteError });
		return databaseError('Failed to delete articles');
	}

	const articleCount = articles?.length || 0;
	const storageFilesDeleted = storagePaths.length;

	log.info('Reader mode nuke complete', {
		articles: articleCount,
		articleCharts: articleCharts?.length || 0,
		storageFilesDeleted
	});

	return json({
		success: true,
		deleted: articleCount
	});
};
