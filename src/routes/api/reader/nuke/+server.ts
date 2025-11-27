import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError } from '$lib/api/errors';

/**
 * E-Reader Nuke Endpoint
 *
 * POST /api/reader/nuke
 * Deletes all e-reader data for the current user:
 * 1. Fetches all articles and charts to get file paths
 * 2. Deletes files from Supabase Storage (PDFs, images, thumbnails)
 * 3. Deletes from database (CASCADE handles article_charts and article_chat)
 *
 * Response: { success: true } or { error: { message, code } }
 */

export const POST: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. FETCH ALL ARTICLES TO GET FILE PATHS
	const { data: articles, error: articlesFetchError } = await supabase
		.from('articles')
		.select('id, pdf_storage_path')
		.eq('user_id', userId);

	if (articlesFetchError) {
		// Continue anyway - we still want to try deletion
	}

	// 3. FETCH ALL CHARTS TO GET FILE PATHS
	const { data: charts, error: chartsFetchError } = await supabase
		.from('article_charts')
		.select('storage_path, thumbnail_path')
		.eq('user_id', userId);

	if (chartsFetchError) {
		// Continue anyway
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

	if (charts && charts.length > 0) {
		for (const chart of charts) {
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
		await supabase.storage.from('article-pdfs').remove(pdfPaths);
	}

	if (imagePaths.length > 0) {
		await supabase.storage.from('article-images').remove(imagePaths);
	}

	if (thumbnailPaths.length > 0) {
		await supabase.storage.from('article-thumbnails').remove(thumbnailPaths);
	}

	// 6. DELETE ALL ARTICLES FROM DATABASE (CASCADE handles article_charts and article_chat)
	const { error: deleteError } = await supabase
		.from('articles')
		.delete()
		.eq('user_id', userId);

	if (deleteError) {
		return databaseError('Failed to delete articles');
	}

	const articleCount = articles?.length || 0;

	return json({
		success: true,
		deleted: articleCount
	});
};
