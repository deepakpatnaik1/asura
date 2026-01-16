/**
 * Chat Files API - Update and Delete
 *
 * PUT: Update file metadata (enabled, title, starred, protected, annotation)
 * DELETE: Delete a file
 *
 * Note: is_enabled controls context injection within owner's domain.
 * Owner routes files to personas; is_enabled filters what's currently active.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { databaseError, notFoundError, validationError } from '$lib/api/errors';

/**
 * PUT /api/chat/files/[id]
 * Update content metadata (enabled, title, starred, protected, annotation)
 */
export const PUT: RequestHandler = async ({ params, request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('File ID is required', 'id');
	}

	// Parse request body
	interface PendingAnnotation {
		headerText: string;
		headerLevel: number;
	}
	const parseResult = await parseRequestJson<{
		is_enabled?: boolean;
		title?: string;
		is_starred?: boolean;
		is_protected?: boolean;
		pending_annotation?: PendingAnnotation | null;
	}>(request);
	if (!parseResult.success) return parseResult.error;

	const { is_enabled, title, is_starred, is_protected, pending_annotation } = parseResult.data;

	// Build update object with only provided fields
	const updateData: {
		is_enabled?: boolean;
		title?: string;
		is_starred?: boolean;
		is_protected?: boolean;
		pending_annotation?: PendingAnnotation | null;
		updated_at: string;
	} = {
		updated_at: new Date().toISOString()
	};

	if (typeof is_enabled === 'boolean') {
		updateData.is_enabled = is_enabled;
	}

	if (typeof title === 'string') {
		const trimmedTitle = title.trim();
		if (trimmedTitle.length === 0) {
			return validationError('Title cannot be empty', 'title');
		}
		if (trimmedTitle.length > 255) {
			return validationError('Title must be 255 characters or less', 'title');
		}
		updateData.title = trimmedTitle;
	}

	if (typeof is_starred === 'boolean') {
		updateData.is_starred = is_starred;
	}

	if (typeof is_protected === 'boolean') {
		updateData.is_protected = is_protected;
	}

	// Handle pending_annotation (can be set to object or cleared with null)
	if (pending_annotation !== undefined) {
		updateData.pending_annotation = pending_annotation;
	}

	// Must have at least one field to update
	if (
		updateData.is_enabled === undefined &&
		updateData.title === undefined &&
		updateData.is_starred === undefined &&
		updateData.is_protected === undefined &&
		updateData.pending_annotation === undefined
	) {
		return validationError('Must provide is_enabled, title, is_starred, is_protected, or pending_annotation to update', 'body');
	}

	// Update content (RLS ensures user can only update their own content)
	const { data, error } = await supabase
		.from('articles')
		.update(updateData)
		.eq('id', id)
		.eq('user_id', userId)
		.select('id')
		.single();

	if (error || !data) {
		return notFoundError('Content not found');
	}

	return json({ success: true });
};

/**
 * DELETE /api/chat/files/[id]
 * Delete a file permanently
 */
export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('File ID is required', 'id');
	}

	// 1. FETCH CHARTS TO GET FILE PATHS (before deletion)
	const { data: charts } = await supabase
		.from('article_charts')
		.select('storage_path, thumbnail_path')
		.eq('content_id', id)
		.eq('user_id', userId);

	// 2. DELETE FILES FROM SUPABASE STORAGE
	const storagePaths: string[] = [];
	if (charts && charts.length > 0) {
		for (const chart of charts) {
			if (chart.storage_path) storagePaths.push(chart.storage_path);
			if (chart.thumbnail_path) storagePaths.push(chart.thumbnail_path);
		}
	}
	if (storagePaths.length > 0) {
		await supabase.storage.from('content').remove(storagePaths);
	}

	// 3. DELETE ASSOCIATED SUPERJOURNAL ENTRIES
	// Two patterns: old (content marker in ai_response) and new (content_id column)
	await Promise.all([
		// Old pattern: <!--content:uuid--> in ai_response
		supabase
			.from('superjournal')
			.delete()
			.eq('user_id', userId)
			.like('ai_response', `%<!--content:${id}-->%`),
		// New pattern: content_id column (used by PDF, scan, image uploads)
		supabase
			.from('superjournal')
			.delete()
			.eq('user_id', userId)
			.eq('content_id', id)
	]);

	// 4. DELETE CONTENT FROM DATABASE (CASCADE handles charts via FK)
	// No mode filter - user owns the content, ID is unique
	const { error } = await supabase
		.from('articles')
		.delete()
		.eq('id', id)
		.eq('user_id', userId);

	if (error) {
		return databaseError('Failed to delete file');
	}

	return json({ success: true });
};
