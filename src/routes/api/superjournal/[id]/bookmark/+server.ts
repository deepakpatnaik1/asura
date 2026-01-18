/**
 * Bookmark API - Embed bookmark marker in message content
 *
 * PATCH: Place or remove bookmark marker in superjournal entry
 *
 * The bookmark is embedded as <!--bookmark--> HTML comment in the content,
 * making it survive DOM re-renders (same pattern as annotations).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { databaseError, notFoundError, validationError } from '$lib/api/errors';

interface BookmarkRequest {
	anchor_type: 'header' | 'divider' | 'fenced' | 'codeblock' | 'paragraph';
	anchor_text: string;
	anchor_index: number;
}

/**
 * PATCH /api/superjournal/[id]/bookmark
 * Place or remove a bookmark marker in the message content
 */
export const PATCH: RequestHandler = async ({ params, request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('Message ID is required', 'id');
	}

	// Parse request body - can be BookmarkRequest or null (to remove)
	const parseResult = await parseRequestJson<BookmarkRequest | null>(request);
	if (!parseResult.success) return parseResult.error;
	const bookmarkRequest = parseResult.data;

	// Fetch current user settings to check for existing bookmark
	const { data: settings, error: settingsError } = await supabase
		.from('user_settings')
		.select('scroll_bookmark')
		.eq('user_id', userId)
		.single();

	if (settingsError && settingsError.code !== 'PGRST116') {
		return databaseError('Failed to fetch user settings');
	}

	interface BookmarkAnchor {
		message_id: string;
		anchor_type: string;
		anchor_text: string;
		anchor_index: number;
	}
	const existingBookmark = settings?.scroll_bookmark as BookmarkAnchor | null;
	let clearedMessageId: string | null = null;

	// If there's an existing bookmark on a DIFFERENT message, clear it
	if (existingBookmark && existingBookmark.message_id !== id) {
		const clearResult = await clearBookmarkFromMessage(supabase, userId, existingBookmark.message_id);
		if (clearResult.success) {
			clearedMessageId = existingBookmark.message_id;
		}
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
		// Fetch article details
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
			// Live-linked file: read from disk
			try {
				content = readFileSync(sourcePath, 'utf-8');
			} catch (err) {
				return databaseError(`Failed to read file: ${sourcePath}`);
			}
		} else if (article.raw_content) {
			// Database-stored article
			content = article.raw_content;
		} else {
			content = '';
		}
	} else {
		// Regular AI response
		content = entry.ai_response || '';
	}

	// Strip any existing bookmark marker (safety + for removal case)
	content = content.replace(/<!--bookmark-->\n?/g, '');

	// If request is null, we're just removing the bookmark
	if (bookmarkRequest === null) {
		// Update content without bookmark
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

		// Clear bookmark from user settings
		await supabase
			.from('user_settings')
			.upsert({
				user_id: userId,
				scroll_bookmark: null,
				updated_at: new Date().toISOString()
			}, { onConflict: 'user_id' });

		return json({
			success: true,
			content,
			bookmark_anchor: null,
			cleared_message_id: clearedMessageId,
			is_linked_article: isLinkedArticle,
			article_id: articleId
		});
	}

	// Validate bookmark request
	const { anchor_type, anchor_text, anchor_index } = bookmarkRequest;
	if (!anchor_type || typeof anchor_index !== 'number') {
		return validationError('anchor_type and anchor_index are required', 'anchor_type');
	}

	// Place bookmark at the anchor position
	const placementResult = placeBookmark(content, anchor_type, anchor_text, anchor_index);
	if (!placementResult.success) {
		// Fallback: place at start of content
		content = `<!--bookmark-->\n${content}`;
	} else {
		content = placementResult.content;
	}

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

	// Save bookmark anchor to user settings
	const newBookmark: BookmarkAnchor = {
		message_id: id,
		anchor_type,
		anchor_text,
		anchor_index
	};

	await supabase
		.from('user_settings')
		.upsert({
			user_id: userId,
			scroll_bookmark: newBookmark,
			updated_at: new Date().toISOString()
		}, { onConflict: 'user_id' });

	return json({
		success: true,
		content,
		bookmark_anchor: newBookmark,
		cleared_message_id: clearedMessageId,
		is_linked_article: isLinkedArticle,
		article_id: articleId
	});
};

/**
 * Clear bookmark from a message (when moving bookmark to different message)
 */
async function clearBookmarkFromMessage(
	supabase: SupabaseClient,
	userId: string,
	messageId: string
): Promise<{ success: boolean }> {
	// Fetch the message
	const { data: entry, error } = await supabase
		.from('superjournal')
		.select('id, ai_response')
		.eq('id', messageId)
		.eq('user_id', userId)
		.single();

	if (error || !entry) {
		return { success: false };
	}

	// Check if linked article
	const contentMarkerRegex = /^<!--content:([a-f0-9-]+)-->(?:\n[\s\S]*)?$/;
	const contentMatch = entry.ai_response?.match(contentMarkerRegex);
	const articleId = contentMatch?.[1] || null;

	if (articleId) {
		// Linked article - fetch and update
		const { data: article } = await supabase
			.from('articles')
			.select('id, raw_content, source_path')
			.eq('id', articleId)
			.eq('user_id', userId)
			.single();

		if (article) {
			if (article.source_path && existsSync(article.source_path)) {
				// File-based: read, strip, write
				try {
					let content = readFileSync(article.source_path, 'utf-8');
					content = content.replace(/<!--bookmark-->\n?/g, '');
					writeFileSync(article.source_path, content, 'utf-8');
				} catch {
					// Ignore file errors during cleanup
				}
			} else if (article.raw_content) {
				// Database-stored: strip and update
				const cleanContent = article.raw_content.replace(/<!--bookmark-->\n?/g, '');
				await supabase
					.from('articles')
					.update({ raw_content: cleanContent, updated_at: new Date().toISOString() })
					.eq('id', articleId)
					.eq('user_id', userId);
			}
		}
	} else {
		// Regular message: strip bookmark from ai_response
		const cleanResponse = entry.ai_response?.replace(/<!--bookmark-->\n?/g, '') || '';
		await supabase
			.from('superjournal')
			.update({ ai_response: cleanResponse })
			.eq('id', messageId)
			.eq('user_id', userId);
	}

	return { success: true };
}

/**
 * Place bookmark marker before the specified anchor in content
 */
function placeBookmark(
	content: string,
	anchorType: string,
	anchorText: string,
	anchorIndex: number
): { success: boolean; content: string } {
	const bookmarkMarker = '<!--bookmark-->\n';

	// Build regex pattern based on anchor type
	let pattern: RegExp;
	switch (anchorType) {
		case 'header':
			// Match any header level with text
			pattern = /^(#{1,6})\s+(.*)$/gm;
			break;
		case 'divider':
			// Match horizontal rules
			pattern = /^(---+|\*\*\*+|___+)\s*$/gm;
			break;
		case 'fenced':
			// Match fenced containers (:::red, :::blue, :::boss, :::review)
			pattern = /^:::(red|blue|boss|review)\n[\s\S]*?^:::$/gm;
			break;
		case 'codeblock':
			// Match code blocks
			pattern = /^```\w*\n[\s\S]*?^```$/gm;
			break;
		case 'paragraph':
			// Match non-empty lines that aren't headers, lists, or other structures
			// This is fuzzy - try to match by text content
			if (anchorText) {
				const escapedText = escapeRegExp(anchorText.slice(0, 50));
				pattern = new RegExp(`^(?![#\\-*>\\d\\|]).*${escapedText}.*$`, 'gm');
			} else {
				return { success: false, content };
			}
			break;
		default:
			return { success: false, content };
	}

	// Find all matches
	const matches = [...content.matchAll(pattern)];
	if (matches.length === 0) {
		return { success: false, content };
	}

	// Try to find by index first
	let targetMatch = matches[anchorIndex];

	// If index out of range, try fuzzy text match for headers
	if (!targetMatch && anchorType === 'header' && anchorText) {
		for (const match of matches) {
			const headerText = match[2]?.trim() || '';
			if (fuzzyMatch(headerText, anchorText)) {
				targetMatch = match;
				break;
			}
		}
	}

	// Fallback to first match
	if (!targetMatch && matches.length > 0) {
		targetMatch = matches[0];
	}

	if (!targetMatch || targetMatch.index === undefined) {
		return { success: false, content };
	}

	// Insert bookmark before the matched element
	const before = content.slice(0, targetMatch.index);
	const after = content.slice(targetMatch.index);
	return {
		success: true,
		content: before + bookmarkMarker + after
	};
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
			// Write to file
			try {
				writeFileSync(sourcePath, content, 'utf-8');
			} catch (err) {
				return { success: false, error: `Failed to write file: ${sourcePath}` };
			}
		} else {
			// Update database
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
		// Update superjournal ai_response
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

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Simple fuzzy match for text comparison
 */
function fuzzyMatch(a: string, b: string): boolean {
	if (!a || !b) return false;
	if (a === b) return true;

	const aLower = a.toLowerCase().trim();
	const bLower = b.toLowerCase().trim();

	// Check containment
	if (aLower.includes(bLower) || bLower.includes(aLower)) return true;

	// Check significant overlap (50% threshold for headers)
	const shorter = aLower.length < bLower.length ? aLower : bLower;
	const longer = aLower.length < bLower.length ? bLower : aLower;

	let matches = 0;
	for (let i = 0; i < shorter.length; i++) {
		if (shorter[i] === longer[i]) matches++;
	}

	return (matches / shorter.length) >= 0.5;
}
