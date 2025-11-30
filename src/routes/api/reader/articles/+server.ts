import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { deleteArticleSchema, validateSchema } from '$lib/schemas';
import { databaseError } from '$lib/api/errors';

/**
 * Articles Management Endpoint
 *
 * GET: Fetch all articles for current user
 * DELETE: Delete an article and all related data (including storage files)
 *
 * GET /api/reader/articles
 * Response: { articles: Array<{ id, title, created_at }> }
 *
 * DELETE /api/reader/articles
 * Body: { article_id: string }
 * Response: { success: true }
 *
 * DELETE performs full cleanup:
 * 1. Fetches article and related charts to get file paths
 * 2. Deletes files from Supabase Storage
 * 3. Deletes from database (cascade handles charts via FK)
 *
 * Note: Anthropic Files API files are not deleted - they expire automatically.
 */

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. FETCH ARTICLES FROM DATABASE (reader mode content)
	const { data: articles, error: fetchError } = await supabase
		.from('content')
		.select('id, title, created_at')
		.eq('user_id', userId)
		.eq('mode', 'reader')
		.order('created_at', { ascending: false }); // Most recent first

	if (fetchError) {
		return databaseError('Failed to fetch articles');
	}

	return json({
		articles: articles || []
	}, {
		headers: {
			'Cache-Control': 'no-cache, no-store, must-revalidate' // Always fetch fresh list
		}
	});
};

export const DELETE: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. PARSE AND VALIDATE REQUEST BODY
	const parseResult = await parseRequestJson<unknown>(request);
	if (!parseResult.success) return parseResult.error;

	const validation = validateSchema(deleteArticleSchema, parseResult.data);
	if (!validation.success) return validation.error;

	const { article_id } = validation.data;

	// 3. FETCH CHARTS TO GET FILE PATHS (before deletion)
	const { data: charts, error: chartsFetchError } = await supabase
		.from('charts')
		.select('storage_path, thumbnail_path, anthropic_file_id')
		.eq('content_id', article_id)
		.eq('user_id', userId);

	if (chartsFetchError) {
		// Continue anyway
	}

	// 4. DELETE FILES FROM SUPABASE STORAGE
	const storagePaths: string[] = [];

	// Add chart image and thumbnail paths
	if (charts && charts.length > 0) {
		for (const chart of charts) {
			if (chart.storage_path) storagePaths.push(chart.storage_path);
			if (chart.thumbnail_path) storagePaths.push(chart.thumbnail_path);
		}
	}

	if (storagePaths.length > 0) {
		// Group by bucket (extract bucket name from path)
		const pdfPaths = storagePaths.filter((p) => p.startsWith('article-pdfs/'));
		const imagePaths = storagePaths.filter((p) => p.startsWith('article-images/'));
		const thumbnailPaths = storagePaths.filter((p) => p.startsWith('article-thumbnails/'));

		// Delete from each bucket
		if (pdfPaths.length > 0) {
			await supabase.storage.from('article-pdfs').remove(pdfPaths.map((p) => p.replace('article-pdfs/', '')));
		}

		if (imagePaths.length > 0) {
			await supabase.storage.from('article-images').remove(imagePaths.map((p) => p.replace('article-images/', '')));
		}

		if (thumbnailPaths.length > 0) {
			await supabase.storage.from('article-thumbnails').remove(thumbnailPaths.map((p) => p.replace('article-thumbnails/', '')));
		}
	}

	// 5. DELETE CONTENT FROM DATABASE (CASCADE handles charts via FK)
	const { error: deleteError } = await supabase
		.from('content')
		.delete()
		.eq('id', article_id)
		.eq('user_id', userId)
		.eq('mode', 'reader');

	if (deleteError) {
		return databaseError('Failed to delete article');
	}

	return json({
		success: true
	});
};
