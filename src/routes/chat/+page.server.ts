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

	// Fetch last N Superjournal entries, newest first (paginated)
	const { data: messages, error, count } = await monitor.track('fetchSuperjournal', () =>
		supabase
			.from('superjournal')
			.select('*', { count: 'exact' })
			.order('created_at', { ascending: false })
			.limit(PAGE_SIZE)
	);

	if (error) {
		return { messages: [], starredIds: [], orphans: [], user, hasMore: false, totalCount: 0 };
	}

	const totalCount = count ?? 0;
	const hasMore = totalCount > PAGE_SIZE;

	// Fetch starred journal entries to get their superjournal_ids
	const { data: starredJournals } = await monitor.track('fetchStarredJournals', () =>
		supabase
			.from('journal')
			.select('superjournal_id')
			.eq('is_starred', true)
			.eq('user_id', user!.id)
	);

	const starredIds = (starredJournals || [])
		.map((j) => j.superjournal_id)
		.filter((id): id is string => id !== null);

	// Fetch all journal superjournal_ids to find orphans
	const { data: allJournals } = await monitor.track('fetchJournalIds', () =>
		supabase
			.from('journal')
			.select('superjournal_id')
			.eq('user_id', user!.id)
	);

	const journalSuperjournalIds = new Set(
		(allJournals || []).map((j) => j.superjournal_id).filter(Boolean)
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


	// Format timestamps on the server to prevent hydration mismatch
	const messagesWithFormattedTimestamps = (messages || []).map((msg) => ({
		...msg,
		formatted_timestamp: formatTimestamp(msg.created_at)
	}));

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
		totalCount
	};
};
