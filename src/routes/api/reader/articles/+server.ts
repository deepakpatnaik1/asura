import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Articles Management Endpoint
 *
 * GET: Fetch all articles for current user
 * DELETE: Delete an article and all related data (including storage files)
 *
 * GET /api/reader/articles
 * Response: { articles: Array<{ id, title, preview_snippet }> }
 *
 * DELETE /api/reader/articles
 * Body: { article_id: string }
 * Response: { success: true }
 *
 * DELETE performs full cleanup:
 * 1. Fetches article and related charts to get file paths
 * 2. Deletes files from Supabase Storage
 * 3. Deletes from database (cascade handles article_charts and article_chat)
 *
 * Note: Anthropic Files API files are not deleted - they expire automatically.
 */

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
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

	// 2. FETCH ARTICLES FROM DATABASE
	const { data: articles, error: fetchError } = await supabase
		.from('articles')
		.select('id, title, preview_snippet, created_at')
		.eq('user_id', userId)
		.order('created_at', { ascending: false }); // Most recent first

	if (fetchError) {
		return json(
			{
				error: {
					message: 'Failed to fetch articles',
					code: 'DATABASE_ERROR',
					details: fetchError.message
				}
			},
			{ status: 500 }
		);
	}

	return json({
		articles: articles || []
	}, {
		headers: {
			'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' // 1 min cache
		}
	});
};

export const DELETE: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
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

	// 2. PARSE REQUEST BODY
	const { article_id } = await request.json();

	if (!article_id || typeof article_id !== 'string') {
		return json(
			{
				error: {
					message: 'Missing or invalid article_id',
					code: 'INVALID_INPUT'
				}
			},
			{ status: 400 }
		);
	}

	// 3. FETCH ARTICLE AND CHARTS TO GET FILE PATHS (before deletion)
	const { data: article, error: articleFetchError } = await supabase
		.from('articles')
		.select('pdf_storage_path, anthropic_file_id')
		.eq('id', article_id)
		.eq('user_id', userId)
		.single();

	if (articleFetchError) {
		// Continue anyway - we still want to delete the database record
	}

	const { data: charts, error: chartsFetchError } = await supabase
		.from('article_charts')
		.select('storage_path, thumbnail_path, anthropic_file_id')
		.eq('article_id', article_id)
		.eq('user_id', userId);

	if (chartsFetchError) {
		// Continue anyway
	}

	// 4. DELETE FILES FROM SUPABASE STORAGE
	const storagePaths: string[] = [];

	// Add article PDF path
	if (article?.pdf_storage_path) {
		storagePaths.push(article.pdf_storage_path);
	}

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

	// 5. DELETE ARTICLE FROM DATABASE (CASCADE handles article_charts and article_chat)
	const { error: deleteError } = await supabase
		.from('articles')
		.delete()
		.eq('id', article_id)
		.eq('user_id', userId);

	if (deleteError) {
		return json(
			{
				error: {
					message: 'Failed to delete article',
					code: 'DATABASE_ERROR',
					details: deleteError.message
				}
			},
			{ status: 500 }
		);
	}

	return json({
		success: true
	});
};
