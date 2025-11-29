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

	const { data: messages, error, count } = await supabase
		.from('superjournal')
		.select('*', { count: 'exact' })
		.order('created_at', { ascending: false })
		.range(offset, offset + limit - 1);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	const totalCount = count ?? 0;
	const hasMore = offset + limit < totalCount;

	const messagesWithTimestamps = (messages || []).map((msg) => ({
		...msg,
		formatted_timestamp: formatTimestamp(msg.created_at)
	}));

	return json({
		messages: messagesWithTimestamps,
		hasMore,
		totalCount,
		offset,
		limit
	});
};
