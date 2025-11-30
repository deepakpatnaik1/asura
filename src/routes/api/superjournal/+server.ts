import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { session } = await safeGetSession();
	if (!session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const offset = parseInt(url.searchParams.get('offset') || '0', 10);
	const limit = Math.min(parseInt(url.searchParams.get('limit') || String(PAGE_SIZE), 10), 100);
	const contentId = url.searchParams.get('content_id');
	const mode = url.searchParams.get('mode');

	// Build query with optional filters
	let query = supabase
		.from('superjournal')
		.select('*', { count: 'exact' });

	// Filter by content_id (for reader mode article filtering)
	if (contentId) {
		query = query.eq('content_id', contentId);
	}

	// Filter by mode (chat vs reader)
	if (mode) {
		query = query.eq('mode', mode);
	}

	// For reader mode, order ascending (oldest first for conversation flow)
	// For chat mode, order descending (newest first for pagination)
	const ascending = mode === 'reader';
	query = query.order('created_at', { ascending });

	if (!ascending) {
		query = query.range(offset, offset + limit - 1);
	}

	const { data: messages, error, count } = await query;

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	const totalCount = count ?? 0;
	const hasMore = offset + limit < totalCount;

	const messagesWithTimestamps = (messages || []).map((msg) => ({
		...msg,
		formatted_timestamp: formatTimestamp(msg.created_at)
	}));

	// For reader mode, return as 'entries' key for consistency
	if (mode === 'reader') {
		return json({
			entries: messagesWithTimestamps,
			totalCount
		});
	}

	return json({
		messages: messagesWithTimestamps,
		hasMore,
		totalCount,
		offset,
		limit
	});
};
