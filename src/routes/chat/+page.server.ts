import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

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

	// Fetch all Superjournal entries, newest first
	const { data: messages, error } = await supabase
		.from('superjournal')
		.select('*')
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Error loading superjournal:', error);
		return { messages: [], starredIds: [], orphans: [], user };
	}

	// Fetch starred journal entries to get their superjournal_ids
	const { data: starredJournals } = await supabase
		.from('journal')
		.select('superjournal_id')
		.eq('is_starred', true)
		.eq('user_id', user!.id);

	const starredIds = (starredJournals || [])
		.map((j) => j.superjournal_id)
		.filter((id): id is string => id !== null);

	// Fetch all journal superjournal_ids to find orphans
	const { data: allJournals } = await supabase
		.from('journal')
		.select('superjournal_id')
		.eq('user_id', user!.id);

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

	if (orphans.length > 0) {
		console.log(`[Orphan Recovery] Found ${orphans.length} orphan entries to recover`);
	}

	// Format timestamps on the server to prevent hydration mismatch
	const messagesWithFormattedTimestamps = (messages || []).map((msg) => ({
		...msg,
		formatted_timestamp: formatTimestamp(msg.created_at)
	}));

	return {
		messages: messagesWithFormattedTimestamps,
		starredIds,
		orphans,
		user
	};
};
