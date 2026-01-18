import type { PageServerLoad } from './$types';
import { existsSync, readFileSync } from 'fs';
import { createLogger } from '$lib/api/logger';
import { createQueryMonitor } from '$lib/api/query-monitor';
import { BOOKMARK } from '$lib/config/memory';

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
	const { user } = await safeGetSession();

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
				.select('id, raw_content, source_path')
				.in('id', contentIds)
		);

		if (contents) {
			for (const c of contents) {
				// If source_path exists, read fresh content from disk (live-linked file)
				if (c.source_path) {
					try {
						if (existsSync(c.source_path)) {
							const freshContent = readFileSync(c.source_path, 'utf-8');
							contentMap.set(c.id, freshContent);
						} else {
							contentMap.set(c.id, `> **File not found:** ${c.source_path}\n\nThe linked file may have been moved or deleted.`);
						}
					} catch {
						contentMap.set(c.id, `> **Error reading file:** ${c.source_path}\n\nCannot access the linked file.`);
					}
				} else {
					// Static content - use stored raw_content
					contentMap.set(c.id, c.raw_content || '');
				}
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

	// Fetch user settings (for selected_persona, watched_article_id, focused_message_id, scroll_bookmark, last paste settings)
	const { data: settings } = await monitor.track('fetchSettings', async () =>
		await supabase
			.from('user_settings')
			.select('selected_persona, default_model, watched_article_id, focused_message_id, scroll_bookmark, last_content_owner, last_content_lifecycle')
			.eq('user_id', user!.id)
			.single()
	);

	// Validate scroll_bookmark - auto-clear if stale (message deleted or bookmark marker removed)
	let validatedScrollBookmark = settings?.scroll_bookmark || null;
	if (validatedScrollBookmark && typeof validatedScrollBookmark === 'object' && 'message_id' in validatedScrollBookmark) {
		const bookmarkData = validatedScrollBookmark as { message_id: string };
		const bookmarkMessageId = bookmarkData.message_id;

		// First check if message is in loaded messages
		let bookmarkedMessage = messagesWithFormattedTimestamps.find(msg => msg.id === bookmarkMessageId);
		let contentToCheck = bookmarkedMessage?.ai_response;

		// If not in loaded messages, fetch it specifically
		if (!bookmarkedMessage) {
			const { data: fetchedMessage } = await supabase
				.from('superjournal')
				.select('id, ai_response')
				.eq('id', bookmarkMessageId)
				.eq('user_id', user!.id)
				.single();

			if (fetchedMessage) {
				// Check if it's a linked article and expand content
				const match = fetchedMessage.ai_response?.match(contentMarkerRegex);
				if (match) {
					const contentId = match[1];
					// Check if we already have this content, otherwise fetch it
					let expandedContent = contentMap.get(contentId);
					if (!expandedContent) {
						const { data: article } = await supabase
							.from('articles')
							.select('id, raw_content, source_path')
							.eq('id', contentId)
							.eq('user_id', user!.id)
							.single();

						if (article?.source_path && existsSync(article.source_path)) {
							try {
								expandedContent = readFileSync(article.source_path, 'utf-8');
							} catch {
								expandedContent = '';
							}
						} else {
							expandedContent = article?.raw_content || '';
						}
					}
					contentToCheck = expandedContent;
				} else {
					contentToCheck = fetchedMessage.ai_response;
				}
			}
		}

		// Validate: content must exist AND contain bookmark marker
		const isValid = contentToCheck && contentToCheck.includes(BOOKMARK.marker);

		if (!isValid) {
			// Clear stale bookmark from database
			await supabase
				.from('user_settings')
				.update({ scroll_bookmark: null, updated_at: new Date().toISOString() })
				.eq('user_id', user!.id);

			validatedScrollBookmark = null;
			log.info('Cleared stale scroll_bookmark', {
				bookmarkMessageId,
				reason: contentToCheck ? 'marker_missing' : 'message_not_found'
			});
		}
	}

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
		defaultModel: settings?.default_model || 'claude-haiku-4-5-20251001',
		watchedArticleId: settings?.watched_article_id || null,
		focusedMessageId: settings?.focused_message_id || null,
		scrollBookmark: validatedScrollBookmark,
		lastContentOwner: settings?.last_content_owner || 'no-one',
		lastContentLifecycle: settings?.last_content_lifecycle || 'raw'
	};
};
