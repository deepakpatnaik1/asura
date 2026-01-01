/**
 * Annotate API - Write feedback to linked Obsidian file
 *
 * POST: Insert annotation callout before specified header
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync, writeFileSync } from 'fs';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { databaseError, notFoundError, validationError } from '$lib/api/errors';

interface AnnotateRequest {
	headerText: string;
	headerLevel: number;
	headerIndex: number;
	feedback: string;
}

/**
 * POST /api/chat/files/[id]/annotate
 * Insert annotation before the specified header in the linked markdown file
 */
export const POST: RequestHandler = async ({ params, request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('Article ID is required', 'id');
	}

	// Parse request body
	const parseResult = await parseRequestJson<AnnotateRequest>(request);
	if (!parseResult.success) return parseResult.error;

	const { headerText, headerLevel, headerIndex, feedback } = parseResult.data;

	if (!headerText || typeof headerText !== 'string') {
		return validationError('headerText is required', 'headerText');
	}
	if (typeof headerLevel !== 'number') {
		return validationError('headerLevel is required', 'headerLevel');
	}
	if (typeof headerIndex !== 'number') {
		return validationError('headerIndex is required', 'headerIndex');
	}
	if (!feedback || typeof feedback !== 'string' || feedback.trim().length === 0) {
		return validationError('feedback is required', 'feedback');
	}

	// Fetch article to get source_path
	const { data: article, error: fetchError } = await supabase
		.from('articles')
		.select('id, source_path')
		.eq('id', id)
		.eq('user_id', userId)
		.single();

	if (fetchError || !article) {
		return notFoundError('Article not found');
	}

	if (!article.source_path) {
		return validationError('Article is not a linked file (no source_path)', 'id');
	}

	// Read the markdown file
	let content: string;
	try {
		content = readFileSync(article.source_path, 'utf-8');
	} catch (err) {
		return databaseError(`Failed to read file: ${article.source_path}`);
	}

	// Build the header pattern to find ALL matching headers
	// Headers in markdown: # Title, ## Title, etc.
	const headerPrefix = '#'.repeat(headerLevel);
	const headerPattern = new RegExp(
		`^${headerPrefix}\\s+${escapeRegExp(headerText)}\\s*$`,
		'gm'
	);

	// Find all matches and get the one at headerIndex
	const matches = [...content.matchAll(headerPattern)];
	if (matches.length === 0) {
		return validationError(`Header not found: ${headerPrefix} ${headerText}`, 'headerText');
	}
	if (headerIndex >= matches.length) {
		return validationError(`Header index ${headerIndex} out of range (found ${matches.length} matches)`, 'headerIndex');
	}

	const match = matches[headerIndex];
	if (match.index === undefined) {
		return validationError(`Header match has no index`, 'headerText');
	}

	// Build the annotation blockquote
	// Format: > Boss's Feedback: text
	const annotation = `> ${feedback.trim()}\n\n`;

	// Insert annotation before the header
	const beforeHeader = content.slice(0, match.index);
	const headerAndAfter = content.slice(match.index);
	const newContent = beforeHeader + annotation + headerAndAfter;

	// Write the file back
	try {
		writeFileSync(article.source_path, newContent, 'utf-8');
	} catch (err) {
		return databaseError(`Failed to write file: ${article.source_path}`);
	}

	// Clear pending_annotation since we've written the feedback
	await supabase
		.from('articles')
		.update({ pending_annotation: null, updated_at: new Date().toISOString() })
		.eq('id', id)
		.eq('user_id', userId);

	return json({ success: true });
};

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
