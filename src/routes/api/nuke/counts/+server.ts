import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError } from '$lib/api/errors';

/**
 * GET /api/nuke/counts
 *
 * Returns counts for each nuke bucket.
 *
 * Response structure:
 * {
 *   personas: { gunnar: N, kirby: N, ... },
 *   content: { raw: N, artisan: N, canon: N, images: N, linked: N },
 *   canvases: { designer: N, whiteboard: N },
 *   productivity: { todos: N, diary: N }
 * }
 *
 * Content detection logic:
 * - raw: tier='ephemeral', NOT image, NOT linked
 * - artisan: tier='strategic', NOT image, NOT linked
 * - canon: tier='canon'
 * - images: raw_content LIKE '[Uploaded image:%'
 * - linked: source_path IS NOT NULL
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	try {
		// Fetch all superjournal entries to count conversations by persona
		const { data: entries, error: entriesError } = await supabase
			.from('superjournal')
			.select('id, persona_name, ai_response')
			.eq('user_id', userId);

		if (entriesError) {
			return databaseError('Failed to fetch superjournal entries');
		}

		// Separate content turns from conversation turns
		const contentMarkerRegex = /^<!--content:([a-f0-9-]+)-->/;
		const personaCounts: Record<string, number> = {};

		for (const entry of entries || []) {
			const match = entry.ai_response?.match(contentMarkerRegex);
			if (!match) {
				// This is a real conversation turn (not a content marker)
				const persona = entry.persona_name || 'unknown';
				personaCounts[persona] = (personaCounts[persona] || 0) + 1;
			}
		}

		// Fetch all articles to count by content type
		const { data: articles, error: articlesError } = await supabase
			.from('articles')
			.select('id, tier, source_path, raw_content')
			.eq('user_id', userId);

		if (articlesError) {
			return databaseError('Failed to fetch articles');
		}

		// Categorize content using the new detection logic
		const contentCounts = {
			raw: 0,
			artisan: 0,
			canon: 0,
			images: 0,
			linked: 0
		};

		for (const article of articles || []) {
			const isImage = article.raw_content?.startsWith('[Uploaded image:');
			const isLinked = article.source_path !== null;

			if (isImage) {
				contentCounts.images++;
			} else if (isLinked) {
				contentCounts.linked++;
			} else if (article.tier === 'canon') {
				contentCounts.canon++;
			} else if (article.tier === 'strategic') {
				contentCounts.artisan++;
			} else if (article.tier === 'ephemeral') {
				contentCounts.raw++;
			}
		}

		// Fetch canvas counts
		const [designerResult, whiteboardResult] = await Promise.all([
			supabase.from('canvas_designer').select('id', { count: 'exact', head: true }).eq('user_id', userId),
			supabase.from('canvas_whiteboard').select('id', { count: 'exact', head: true }).eq('user_id', userId)
		]);

		// Fetch productivity counts
		const [todosResult, tagsResult, diaryResult] = await Promise.all([
			supabase.from('canvas_planner_todos').select('id', { count: 'exact', head: true }).eq('user_id', userId),
			supabase.from('canvas_planner_tags').select('id', { count: 'exact', head: true }).eq('user_id', userId),
			supabase.from('canvas_planner_diary').select('id', { count: 'exact', head: true }).eq('user_id', userId)
		]);

		return json({
			personas: personaCounts,
			content: contentCounts,
			canvases: {
				designer: designerResult.count || 0,
				whiteboard: whiteboardResult.count || 0
			},
			productivity: {
				todos: (todosResult.count || 0) + (tagsResult.count || 0),
				diary: diaryResult.count || 0
			}
		});
	} catch (error) {
		console.error('[NukeCounts] Error:', error);
		return databaseError('Failed to fetch counts');
	}
};
