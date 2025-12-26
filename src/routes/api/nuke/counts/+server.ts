import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError } from '$lib/api/errors';

/**
 * GET /api/nuke/counts
 *
 * Returns counts for each nuke bucket (how many message turns will be deleted).
 *
 * - Persona counts: superjournal entries that are real conversations (not content)
 * - Content counts: superjournal entries that are content turns, grouped by tier
 * - Productivity counts: todos, tags, diary entries
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	try {
		// Fetch all superjournal entries to categorize
		const { data: entries, error: entriesError } = await supabase
			.from('superjournal')
			.select('id, persona_name, ai_response')
			.eq('user_id', userId);

		if (entriesError) {
			return databaseError('Failed to fetch superjournal entries');
		}

		// Separate content turns from conversation turns
		const contentMarkerRegex = /^<!--content:([a-f0-9-]+)-->/;
		const contentTurns: { id: string; contentId: string }[] = [];
		const personaCounts: Record<string, number> = {};

		for (const entry of entries || []) {
			const match = entry.ai_response?.match(contentMarkerRegex);
			if (match) {
				// This is a content turn
				contentTurns.push({ id: entry.id, contentId: match[1] });
			} else {
				// This is a real conversation turn
				const persona = entry.persona_name || 'unknown';
				personaCounts[persona] = (personaCounts[persona] || 0) + 1;
			}
		}

		// Get tiers for content turns
		const contentIds = contentTurns.map(t => t.contentId);
		let tierCounts: Record<string, number> = {
			ephemeral: 0,
			strategic: 0,
			canon: 0,
			gettysburg: 0
		};

		if (contentIds.length > 0) {
			const { data: articles } = await supabase
				.from('articles')
				.select('id, tier')
				.in('id', contentIds);

			// Build a map of content ID -> tier
			const tierMap = new Map<string, string>();
			for (const article of articles || []) {
				tierMap.set(article.id, article.tier);
			}

			// Count by tier
			for (const turn of contentTurns) {
				const tier = tierMap.get(turn.contentId);
				if (tier && tier in tierCounts) {
					tierCounts[tier]++;
				}
			}
		}

		// Get productivity counts
		const [todosResult, tagsResult, diaryResult] = await Promise.all([
			supabase.from('canvas_planner_todos').select('id', { count: 'exact', head: true }).eq('user_id', userId),
			supabase.from('canvas_planner_tags').select('id', { count: 'exact', head: true }).eq('user_id', userId),
			supabase.from('canvas_planner_diary').select('id', { count: 'exact', head: true }).eq('user_id', userId)
		]);

		return json({
			personas: personaCounts,
			content: tierCounts,
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
