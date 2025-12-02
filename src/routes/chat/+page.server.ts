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
	// Require authentication
	const { session, user } = await safeGetSession();

	if (!session) {
		throw redirect(303, '/login');
	}

	const log = createLogger('ChatPageLoad', user?.id);
	const monitor = createQueryMonitor(log, 100); // 100ms threshold

	// Fetch last N Superjournal entries for CHAT mode, newest first (paginated)
	const { data: messages, error, count } = await monitor.track('fetchSuperjournal', async () =>
		await supabase
			.from('superjournal')
			.select('*', { count: 'exact' })
			.eq('mode', 'chat')
			.order('created_at', { ascending: false })
			.limit(PAGE_SIZE)
	);

	if (error) {
		return { messages: [], starredIds: [], orphans: [], user, hasMore: false, totalCount: 0 };
	}

	const totalCount = count ?? 0;
	const hasMore = totalCount > PAGE_SIZE;

	// Fetch starred journal entries to get their superjournal_ids (chat mode only)
	const { data: starredJournals } = await monitor.track('fetchStarredJournals', async () =>
		await supabase
			.from('journal')
			.select('superjournal_id')
			.eq('is_starred', true)
			.eq('user_id', user!.id)
			.eq('mode', 'chat')
	);

	const starredIds = (starredJournals || [])
		.map((j) => j.superjournal_id)
		.filter((id): id is string => id !== null);

	// Only fetch journal records for superjournal IDs on current page (not ALL journals)
	const currentPageIds = (messages || []).map((m) => m.id);
	const { data: pageJournals } = await monitor.track('fetchJournalIds', async () =>
		await supabase
			.from('journal')
			.select('superjournal_id')
			.eq('user_id', user!.id)
			.eq('mode', 'chat')
			.in('superjournal_id', currentPageIds)
	);

	const journalSuperjournalIds = new Set(
		(pageJournals || []).map((j) => j.superjournal_id).filter(Boolean)
	);

	// Find orphans: superjournal entries older than 10 minutes without journal entries
	const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
	const orphans = (messages || [])
		.filter((msg) => {
			const isOld = msg.created_at < tenMinutesAgo;
			const hasNoJournal = !journalSuperjournalIds.has(msg.id);
			return isOld && hasNoJournal;
		})
		.map((msg) => ({
			superjournal_id: msg.id,
			user_message: msg.user_message,
			ai_response: msg.ai_response,
			persona_name: msg.persona_name
		}));


	// Expand content markers: <!--content:id--> -> actual content from content table
	const contentMarkerRegex = /^<!--content:([a-f0-9-]+)-->(?:\n[\s\S]*)?$/;
	const contentIds = (messages || [])
		.map((msg) => msg.ai_response?.match(contentMarkerRegex)?.[1])
		.filter((id): id is string => Boolean(id));

	let contentMap = new Map<string, string>();
	if (contentIds.length > 0) {
		const { data: contents } = await monitor.track('fetchContentForMarkers', async () =>
			await supabase
				.from('content')
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
			// Always use new format in output
			aiResponse = `<!--content:${contentId}-->\n${expandedContent}`;
		}
		return {
			...msg,
			ai_response: aiResponse,
			formatted_timestamp: formatTimestamp(msg.created_at)
		};
	});

	// Fetch personas from database
	const { data: personas } = await monitor.track('fetchPersonas', async () =>
		await supabase
			.from('personas')
			.select('name, display_name, mode')
			.eq('is_active', true)
			.order('name')
	);

	// Log query performance summary
	const stats = monitor.getStats();
	if (stats.slowQueries > 0) {
		log.warn('Page load had slow queries', {
			totalQueries: stats.totalQueries,
			slowQueries: stats.slowQueries,
			averageMs: stats.averageMs,
			maxMs: stats.maxMs
		});
	} else {
		log.debug('Page load complete', {
			totalQueries: stats.totalQueries,
			averageMs: stats.averageMs,
			maxMs: stats.maxMs
		});
	}

	return {
		messages: messagesWithFormattedTimestamps,
		starredIds,
		orphans,
		user,
		hasMore,
		totalCount,
		personas: personas || []
	};
};
