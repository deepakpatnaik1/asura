/**
 * Bookmark API - Embed bookmark marker in message content
 *
 * PATCH: Place or remove bookmark marker in superjournal entry
 *
 * SIMPLIFIED ARCHITECTURE (marker-only):
 * - The marker embedded in content IS the bookmark
 * - No anchor metadata stored in user_settings
 * - Frontend detects marker in DOM for navigation
 * - External edits (Blue Claude, Obsidian) just work - marker moves with content
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { databaseError, notFoundError } from '$lib/api/errors';
import { BOOKMARK } from '$lib/config/memory';

interface BookmarkPlacement {
	position: 'here';  // Place at click position (beginning of nearest content block)
}

/**
 * PATCH /api/superjournal/[id]/bookmark
 * Place or remove a bookmark marker in the message content
 *
 * Body: { position: 'here' } to place, or null to remove
 */
export const PATCH: RequestHandler = async ({ params, request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return databaseError('Message ID is required');
	}

	// Parse request body - can be BookmarkPlacement or null (to remove)
	const parseResult = await parseRequestJson<BookmarkPlacement | null>(request);
	if (!parseResult.success) return parseResult.error;
	const placementRequest = parseResult.data;

	// First, clear any existing bookmark from ALL messages (single bookmark constraint)
	await clearAllBookmarks(supabase, userId);

	// If request is null, we're just removing - already done above
	if (placementRequest === null) {
		return json({ success: true, action: 'removed' });
	}

	// Fetch target superjournal entry
	const { data: entry, error: fetchError } = await supabase
		.from('superjournal')
		.select('id, ai_response')
		.eq('id', id)
		.eq('user_id', userId)
		.single();

	if (fetchError || !entry) {
		return notFoundError('Message not found');
	}

	// Check if this is a linked article
	const contentMarkerRegex = /^<!--content:([a-f0-9-]+)-->(?:\n[\s\S]*)?$/;
	const contentMatch = entry.ai_response?.match(contentMarkerRegex);
	const isLinkedArticle = Boolean(contentMatch);
	const articleId = contentMatch?.[1] || null;

	// Get the actual content to modify
	let content: string;
	let sourcePath: string | null = null;

	if (isLinkedArticle && articleId) {
		const { data: article, error: articleError } = await supabase
			.from('articles')
			.select('id, raw_content, source_path')
			.eq('id', articleId)
			.eq('user_id', userId)
			.single();

		if (articleError || !article) {
			return notFoundError('Linked article not found');
		}

		sourcePath = article.source_path;

		if (sourcePath && existsSync(sourcePath)) {
			try {
				content = readFileSync(sourcePath, 'utf-8');
			} catch {
				return databaseError(`Failed to read file: ${sourcePath}`);
			}
		} else if (article.raw_content) {
			content = article.raw_content;
		} else {
			content = '';
		}
	} else {
		content = entry.ai_response || '';
	}

	// Place bookmark at start of content (simple, predictable)
	// The marker will be visible in rendered content for user to see
	content = `${BOOKMARK.marker}\n${content}`;

	// Update content with embedded bookmark
	const updateResult = await updateContent(supabase, userId, {
		isLinkedArticle,
		articleId,
		sourcePath,
		entryId: id,
		content
	});

	if (!updateResult.success) {
		return databaseError(updateResult.error || 'Failed to update content');
	}

	return json({
		success: true,
		action: 'placed',
		content,
		is_linked_article: isLinkedArticle,
		article_id: articleId
	});
};

/**
 * Clear bookmark marker from ALL content (superjournal + articles)
 * Ensures single-bookmark constraint without tracking state
 */
async function clearAllBookmarks(
	supabase: SupabaseClient,
	userId: string
): Promise<void> {
	// Clear from all superjournal entries that contain the marker
	const { data: messagesWithBookmark } = await supabase
		.from('superjournal')
		.select('id, ai_response')
		.eq('user_id', userId)
		.like('ai_response', `%${BOOKMARK.marker}%`);

	if (messagesWithBookmark) {
		for (const msg of messagesWithBookmark) {
			const cleanResponse = msg.ai_response?.replace(BOOKMARK.getPattern(), '') || '';
			await supabase
				.from('superjournal')
				.update({ ai_response: cleanResponse })
				.eq('id', msg.id)
				.eq('user_id', userId);
		}
	}

	// Clear from all articles (both file-based and database-stored)
	const { data: articlesWithBookmark } = await supabase
		.from('articles')
		.select('id, raw_content, source_path')
		.eq('user_id', userId);

	if (articlesWithBookmark) {
		for (const article of articlesWithBookmark) {
			// Check file-based articles
			if (article.source_path && existsSync(article.source_path)) {
				try {
					let fileContent = readFileSync(article.source_path, 'utf-8');
					if (fileContent.includes(BOOKMARK.marker)) {
						fileContent = fileContent.replace(BOOKMARK.getPattern(), '');
						writeFileSync(article.source_path, fileContent, 'utf-8');
					}
				} catch {
					// Ignore file errors during cleanup
				}
			}
			// Check database-stored articles
			else if (article.raw_content?.includes(BOOKMARK.marker)) {
				const cleanContent = article.raw_content.replace(BOOKMARK.getPattern(), '');
				await supabase
					.from('articles')
					.update({ raw_content: cleanContent, updated_at: new Date().toISOString() })
					.eq('id', article.id)
					.eq('user_id', userId);
			}
		}
	}
}

/**
 * Update content in the appropriate storage location
 */
async function updateContent(
	supabase: SupabaseClient,
	userId: string,
	options: {
		isLinkedArticle: boolean;
		articleId: string | null;
		sourcePath: string | null;
		entryId: string;
		content: string;
	}
): Promise<{ success: boolean; error?: string }> {
	const { isLinkedArticle, articleId, sourcePath, entryId, content } = options;

	if (isLinkedArticle && articleId) {
		if (sourcePath) {
			try {
				writeFileSync(sourcePath, content, 'utf-8');
			} catch {
				return { success: false, error: `Failed to write file: ${sourcePath}` };
			}
		} else {
			const { error } = await supabase
				.from('articles')
				.update({ raw_content: content, updated_at: new Date().toISOString() })
				.eq('id', articleId)
				.eq('user_id', userId);

			if (error) {
				return { success: false, error: 'Failed to update article' };
			}
		}
	} else {
		const { error } = await supabase
			.from('superjournal')
			.update({ ai_response: content })
			.eq('id', entryId)
			.eq('user_id', userId);

		if (error) {
			return { success: false, error: 'Failed to update message' };
		}
	}

	return { success: true };
}
