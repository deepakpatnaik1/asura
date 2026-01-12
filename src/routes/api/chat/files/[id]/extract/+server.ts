/**
 * Re-extract Tables from Article
 *
 * POST /api/chat/files/[id]/extract
 *
 * Triggers table re-extraction for a live-linked file whose content has changed.
 * Called by SSE handler when file updates are detected.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { notFoundError } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';
import { runExtractTablesContentJob } from '$lib/calls/chat/extract-tables-content';

export const POST: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const log = createLogger('ExtractAPI', userId);
	const articleId = params.id;

	// Fetch the article (linked files are stored in articles table)
	const { data: article, error: fetchError } = await supabase
		.from('articles')
		.select('id, source_path, raw_content')
		.eq('id', articleId)
		.eq('user_id', userId)
		.single();

	if (fetchError || !article) {
		log.warn('Article not found', { articleId: articleId.slice(0, 8), error: fetchError?.message });
		return notFoundError('Article not found');
	}

	// Skip extraction for live-linked files - table click mapping is unreliable
	// because extraction order doesn't match render order for dynamic content
	if (article.source_path) {
		log.info('Skipping extraction for live-linked file', { articleId: articleId.slice(0, 8) });
		return json({ success: true, articleId, chartCount: 0, skipped: true });
	}

	// For non-linked files (pasted content), use stored content
	const contentText = article.raw_content;

	if (!contentText) {
		log.warn('No content to extract from', { articleId: articleId.slice(0, 8) });
		return json({ success: true, articleId, chartCount: 0 });
	}

	log.info('Re-extracting tables for article', { articleId: articleId.slice(0, 8) });

	// Run extraction (clears existing charts and creates fresh ones)
	await runExtractTablesContentJob({
		contentId: articleId, // The extraction job uses contentId which maps to articles.id
		userId,
		content: contentText
	});

	// Fetch updated charts to return count
	const { data: charts } = await supabase
		.from('article_charts')
		.select('id')
		.eq('content_id', articleId)
		.eq('user_id', userId);

	log.info('Extraction complete', { articleId: articleId.slice(0, 8), chartCount: charts?.length || 0 });

	return json({
		success: true,
		articleId,
		chartCount: charts?.length || 0
	});
};
