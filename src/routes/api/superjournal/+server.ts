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

	// Build query - unified conversation (no mode filter)
	let query = supabase
		.from('superjournal')
		.select('*', { count: 'exact' });

	// Filter by content_id (for article-specific conversation)
	if (contentId) {
		query = query.eq('content_id', contentId);
	}

	// Order descending (newest first for pagination)
	query = query.order('created_at', { ascending: false });
	query = query.range(offset, offset + limit - 1);

	const { data: messages, error, count } = await query;

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	const totalCount = count ?? 0;
	const hasMore = offset + limit < totalCount;

	// Expand content markers: <!--content:id--> -> actual content from content table
	const contentMarkerRegex = /^<!--content:([a-f0-9-]+)-->(?:\n[\s\S]*)?$/;
	const contentIds = (messages || [])
		.map((msg) => msg.ai_response?.match(contentMarkerRegex)?.[1])
		.filter((id): id is string => Boolean(id));

	let contentMap = new Map<string, string>();
	if (contentIds.length > 0) {
		const { data: contents } = await supabase
			.from('canvas_gallery_content')
			.select('id, raw_content')
			.in('id', contentIds);

		if (contents) {
			for (const c of contents) {
				contentMap.set(c.id, c.raw_content || '');
			}
		}
	}

	const messagesWithTimestamps = (messages || []).map((msg) => {
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

	return json({
		messages: messagesWithTimestamps,
		hasMore,
		totalCount,
		offset,
		limit
	});
};
