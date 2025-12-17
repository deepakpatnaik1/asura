import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { createLogger } from '$lib/api/logger';
import { createQueryMonitor } from '$lib/api/query-monitor';

const PAGE_SIZE = 50;

function formatTimestamp(dateString: string): string {
	const date = new Date(dateString);
	return date.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});
}

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
	const { session, user } = await safeGetSession();

	if (!session) {
		throw redirect(303, '/login');
	}

	const log = createLogger('PageLoad', user?.id);
	const monitor = createQueryMonitor(log, 100);

	// Fetch ALL superjournal entries (no mode filter) - unified conversation
	const { data: messages, error, count } = await monitor.track('fetchSuperjournal', async () =>
		await supabase
			.from('superjournal')
			.select('*', { count: 'exact' })
			.order('created_at', { ascending: false })
			.limit(PAGE_SIZE)
	);

	if (error) {
		return { messages: [], starredIds: [], user, hasMore: false, totalCount: 0 };
	}

	const totalCount = count ?? 0;
	const hasMore = totalCount > PAGE_SIZE;

	// Fetch starred journal entries (no mode filter)
	const { data: starredJournals } = await monitor.track('fetchStarredJournals', async () =>
		await supabase
			.from('journal')
			.select('superjournal_id')
			.eq('is_starred', true)
			.eq('user_id', user!.id)
	);

	const starredIds = (starredJournals || [])
		.map((j) => j.superjournal_id)
		.filter((id): id is string => id !== null);

	// Expand content markers: <!--content:id--> -> actual content
	const contentMarkerRegex = /^<!--content:([a-f0-9-]+)-->(?:\n[\s\S]*)?$/;
	const contentIds = (messages || [])
		.map((msg) => msg.ai_response?.match(contentMarkerRegex)?.[1])
		.filter((id): id is string => Boolean(id));

	let contentMap = new Map<string, string>();
	if (contentIds.length > 0) {
		const { data: contents } = await monitor.track('fetchContentForMarkers', async () =>
			await supabase
				.from('articles')
				.select('id, raw_content')
				.in('id', contentIds)
		);

		if (contents) {
			for (const c of contents) {
				contentMap.set(c.id, c.raw_content || '');
			}
		}
	}

	// Format timestamps and expand content markers
	const messagesWithFormattedTimestamps = (messages || []).map((msg) => {
		let aiResponse = msg.ai_response;
		const match = aiResponse?.match(contentMarkerRegex);
		if (match) {
			const contentId = match[1];
			const expandedContent = contentMap.get(contentId) || '';
			aiResponse = `<!--content:${contentId}-->\n${expandedContent}`;
		}
		return {
			...msg,
			ai_response: aiResponse,
			formatted_timestamp: formatTimestamp(msg.created_at)
		};
	});

	// Fetch user settings (for selected_persona)
	const { data: settings } = await monitor.track('fetchSettings', async () =>
		await supabase
			.from('user_settings')
			.select('selected_persona, default_model')
			.eq('user_id', user!.id)
			.single()
	);

	// Log query performance
	const stats = monitor.getStats();
	if (stats.slowQueries > 0) {
		log.warn('Page load had slow queries', {
			totalQueries: stats.totalQueries,
			slowQueries: stats.slowQueries,
			averageMs: stats.averageMs,
			maxMs: stats.maxMs
		});
	}

	return {
		messages: messagesWithFormattedTimestamps,
		starredIds,
		user,
		hasMore,
		totalCount,
		selectedPersona: settings?.selected_persona || 'gunnar',
		defaultModel: settings?.default_model || 'claude-haiku-4-5-20251001'
	};
};
