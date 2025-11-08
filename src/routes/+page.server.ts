import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

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

export const load: PageServerLoad = async () => {
	// Fetch all Superjournal entries, newest first
	const { data: messages, error } = await supabase
		.from('superjournal')
		.select('*')
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Error loading superjournal:', error);
		return { messages: [] };
	}

	// Format timestamps on the server to prevent hydration mismatch
	const messagesWithFormattedTimestamps = (messages || []).map(msg => ({
		...msg,
		formatted_timestamp: formatTimestamp(msg.created_at)
	}));

	return {
		messages: messagesWithFormattedTimestamps
	};
};
