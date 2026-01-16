import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { notFoundError, databaseError, internalError } from '$lib/api/errors';

/**
 * Toggle starred status for a superjournal entry
 *
 * Stars are stored on journal entries (for context injection from compressed summaries).
 * If journal doesn't exist yet, creates a placeholder that compression will fill.
 */
export const PATCH: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;
	const { id } = params;

	try {
		// Toggle star on journal entry
		const { data: journalEntry } = await supabase
			.from('journal')
			.select('id, is_starred')
			.eq('superjournal_id', id)
			.eq('user_id', userId)
			.single();

		if (journalEntry) {
			// Journal exists - toggle star
			const newStarredStatus = !journalEntry.is_starred;
			const { error: updateError } = await supabase
				.from('journal')
				.update({ is_starred: newStarredStatus })
				.eq('id', journalEntry.id)
				.eq('user_id', userId);

			if (updateError) {
				return databaseError('Failed to update starred status');
			}

			return json({ success: true, id, is_starred: newStarredStatus });
		}

		// Journal doesn't exist yet - verify superjournal exists and create placeholder
		const { data: superjournal } = await supabase
			.from('superjournal')
			.select('id, persona_name, user_message, ai_response')
			.eq('id', id)
			.eq('user_id', userId)
			.single();

		if (!superjournal) {
			return notFoundError('Superjournal entry');
		}

		// Create placeholder journal row with star enabled
		// Compression job will upsert and fill in the rest
		const personaName = superjournal.persona_name || 'unknown';
		const { error: insertError } = await supabase.from('journal').insert({
			superjournal_id: id,
			user_id: userId,
			turn_essence: `Boss: ${superjournal.user_message || ''}\n${personaName}: ${superjournal.ai_response || ''}`,
			participants: ['boss', personaName.toLowerCase()],
			conversation_arc: 'Pending compression',
			salience_score: 5,
			is_starred: true,
			embedding: null
		});

		if (insertError) {
			return databaseError('Failed to create journal entry');
		}

		return json({ success: true, id, is_starred: true });
	} catch (error) {
		return internalError();
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;
	const { id } = params;

	try {
		// First, check if this message has a linked article (via content_id or content marker)
		const { data: message } = await supabase
			.from('superjournal')
			.select('content_id, ai_response')
			.eq('id', id)
			.eq('user_id', userId)
			.single();

		let articleIdToDelete: string | null = null;

		if (message) {
			// Check content_id column (PDFs, scans, image uploads)
			if (message.content_id) {
				articleIdToDelete = message.content_id;
			} else if (message.ai_response) {
				// Check for old content marker pattern <!--content:uuid-->
				const markerMatch = message.ai_response.match(/<!--content:([a-f0-9-]+)-->/);
				if (markerMatch) {
					articleIdToDelete = markerMatch[1];
				}
			}
		}

		// Delete linked article if found (this cascades to charts and cleans up storage)
		if (articleIdToDelete) {
			// Fetch charts for storage cleanup
			const { data: charts } = await supabase
				.from('article_charts')
				.select('storage_path, thumbnail_path')
				.eq('content_id', articleIdToDelete)
				.eq('user_id', userId);

			// Delete files from storage
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

			// Delete the article (FK cascade handles charts)
			await supabase
				.from('articles')
				.delete()
				.eq('id', articleIdToDelete)
				.eq('user_id', userId);
		}

		// Delete from superjournal (cascade will handle journal)
		// CRITICAL: Include user_id check to prevent cross-user deletions
		const { error } = await supabase
			.from('superjournal')
			.delete()
			.eq('id', id)
			.eq('user_id', userId);

		if (error) {
			return databaseError('Failed to delete message');
		}

		return json({ success: true, id, deleted_article_id: articleIdToDelete });
	} catch (error) {
		return internalError();
	}
};
