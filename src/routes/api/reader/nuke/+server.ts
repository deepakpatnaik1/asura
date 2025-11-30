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
 * 1. article_charts (+ storage files)
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

	// 2. FETCH ALL ARTICLES TO GET FILE PATHS
	const { data: articles, error: articlesFetchError } = await supabase
		.from('articles')
		.select('id, pdf_storage_path')
		.eq('user_id', userId);

	if (articlesFetchError) {
		log.warn('Failed to fetch articles for cleanup', { error: articlesFetchError });
	}

	// 3. FETCH ALL ARTICLE CHARTS TO GET FILE PATHS
	const { data: articleCharts, error: chartsFetchError } = await supabase
		.from('article_charts')
		.select('storage_path, thumbnail_path')
		.eq('user_id', userId);

	if (chartsFetchError) {
		log.warn('Failed to fetch article_charts for cleanup', { error: chartsFetchError });
	}

	// 4. COLLECT ALL STORAGE PATHS
	const pdfPaths: string[] = [];
	const imagePaths: string[] = [];
	const thumbnailPaths: string[] = [];

	if (articles && articles.length > 0) {
		for (const article of articles) {
			if (article.pdf_storage_path) {
				pdfPaths.push(article.pdf_storage_path.replace('article-pdfs/', ''));
			}
		}
	}

	if (articleCharts && articleCharts.length > 0) {
		for (const chart of articleCharts) {
			if (chart.storage_path) {
				imagePaths.push(chart.storage_path.replace('article-images/', ''));
			}
			if (chart.thumbnail_path) {
				thumbnailPaths.push(chart.thumbnail_path.replace('article-thumbnails/', ''));
			}
		}
	}

	// 5. DELETE FROM SUPABASE STORAGE
	if (pdfPaths.length > 0) {
		const { error } = await supabase.storage.from('article-pdfs').remove(pdfPaths);
		if (error) log.warn('Failed to delete PDFs from storage', { error });
	}

	if (imagePaths.length > 0) {
		const { error } = await supabase.storage.from('article-images').remove(imagePaths);
		if (error) log.warn('Failed to delete images from storage', { error });
	}

	if (thumbnailPaths.length > 0) {
		const { error } = await supabase.storage.from('article-thumbnails').remove(thumbnailPaths);
		if (error) log.warn('Failed to delete thumbnails from storage', { error });
	}

	// 6. DELETE ALL ARTICLES FROM DATABASE (CASCADE handles article_charts)
	const { error: deleteError } = await supabase
		.from('articles')
		.delete()
		.eq('user_id', userId);

	if (deleteError) {
		log.error('Failed to delete articles', { error: deleteError });
		return databaseError('Failed to delete articles');
	}

	const articleCount = articles?.length || 0;
	const storageFilesDeleted = pdfPaths.length + imagePaths.length + thumbnailPaths.length;

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
