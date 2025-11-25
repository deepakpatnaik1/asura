import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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
	const { user } = await safeGetSession();
	if (!user) {
		return json(
			{
				error: {
					message: 'Unauthorized - must be logged in',
					code: 'UNAUTHORIZED'
				}
			},
			{ status: 401 }
		);
	}
	const userId = user.id;

	console.log('[Reader Nuke] Starting for user:', userId);

	// 2. FETCH ALL ARTICLES TO GET FILE PATHS
	const { data: articles, error: articlesFetchError } = await supabase
		.from('articles')
		.select('id, pdf_storage_path')
		.eq('user_id', userId);

	if (articlesFetchError) {
		console.error('[Reader Nuke] Failed to fetch articles:', articlesFetchError);
		// Continue anyway - we still want to try deletion
	}

	// 3. FETCH ALL CHARTS TO GET FILE PATHS
	const { data: charts, error: chartsFetchError } = await supabase
		.from('article_charts')
		.select('storage_path, thumbnail_path')
		.eq('user_id', userId);

	if (chartsFetchError) {
		console.error('[Reader Nuke] Failed to fetch charts:', chartsFetchError);
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

	console.log('[Reader Nuke] Files to delete:', {
		pdfs: pdfPaths.length,
		images: imagePaths.length,
		thumbnails: thumbnailPaths.length
	});

	// 5. DELETE FROM SUPABASE STORAGE
	if (pdfPaths.length > 0) {
		const { error } = await supabase.storage.from('article-pdfs').remove(pdfPaths);
		if (error) console.error('[Reader Nuke] Failed to delete PDFs:', error);
		else console.log('[Reader Nuke] Deleted', pdfPaths.length, 'PDFs');
	}

	if (imagePaths.length > 0) {
		const { error } = await supabase.storage.from('article-images').remove(imagePaths);
		if (error) console.error('[Reader Nuke] Failed to delete images:', error);
		else console.log('[Reader Nuke] Deleted', imagePaths.length, 'images');
	}

	if (thumbnailPaths.length > 0) {
		const { error } = await supabase.storage.from('article-thumbnails').remove(thumbnailPaths);
		if (error) console.error('[Reader Nuke] Failed to delete thumbnails:', error);
		else console.log('[Reader Nuke] Deleted', thumbnailPaths.length, 'thumbnails');
	}

	// 6. DELETE ALL ARTICLES FROM DATABASE (CASCADE handles article_charts and article_chat)
	const { error: deleteError } = await supabase
		.from('articles')
		.delete()
		.eq('user_id', userId);

	if (deleteError) {
		console.error('[Reader Nuke] Failed to delete from database:', deleteError);
		return json(
			{
				error: {
					message: 'Failed to delete articles',
					code: 'DATABASE_ERROR',
					details: deleteError.message
				}
			},
			{ status: 500 }
		);
	}

	const articleCount = articles?.length || 0;
	console.log('[Reader Nuke] Successfully deleted', articleCount, 'articles and all related data');

	return json({
		success: true,
		deleted: articleCount
	});
};
