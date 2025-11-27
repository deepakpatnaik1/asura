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
	// NOTE: Currently using SERVICE_ROLE client for data queries
	// This is acceptable because RLS is DISABLED (migration 20251108000003)
	// In Chunk 2, we'll switch to user-scoped queries when RLS is enabled
	const { data: messages, error } = await supabase
		.from('superjournal')
		.select('*')
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Error loading superjournal:', error);
		return { messages: [], starredIds: [], user };
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

	// Format timestamps on the server to prevent hydration mismatch
	const messagesWithFormattedTimestamps = (messages || []).map((msg) => ({
		...msg,
		formatted_timestamp: formatTimestamp(msg.created_at)
	}));

	return {
		messages: messagesWithFormattedTimestamps,
		starredIds,
		user
	};
};
