/**
 * File Watch API - SSE endpoint for live Obsidian file updates
 *
 * POST: Start watching linked files, stream updates when they change
 */

import { watchFile, unwatchFile, existsSync, readFileSync, statSync } from 'fs';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { sseHeaders } from '$lib/api/stream-protocol';
import { validationError } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';

/** Debounce delay to avoid rapid-fire updates */
const DEBOUNCE_MS = 100;

/** Keep-alive interval */
const KEEPALIVE_MS = 10000;

/**
 * POST /api/watch
 * Start watching files and stream updates via SSE
 */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const log = createLogger('WatchAPI', userId);

	// Parse request body
	const parseResult = await parseRequestJson<{ article_ids: string[] }>(request);
	if (!parseResult.success) return parseResult.error;

	const { article_ids } = parseResult.data;

	if (!article_ids || !Array.isArray(article_ids) || article_ids.length === 0) {
		return validationError('article_ids array is required', 'article_ids');
	}

	// Fetch source_paths for the requested articles
	const { data: articles, error } = await supabase
		.from('articles')
		.select('id, source_path')
		.in('id', article_ids)
		.not('source_path', 'is', null);

	if (error) {
		log.error('Failed to fetch articles', { error: error.message });
		return validationError('Failed to fetch articles', 'article_ids');
	}

	const linkedArticles = articles || [];

	if (linkedArticles.length === 0) {
		log.info('No linked articles to watch');
		// Return empty SSE stream that closes immediately
		const stream = new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', message: 'No linked files to watch' })}\n\n`));
				controller.close();
			}
		});
		return new Response(stream, { headers: sseHeaders() });
	}

	log.info('Starting file watch', { articleCount: linkedArticles.length });

	// Track watched paths for cleanup
	const watchedPaths: string[] = [];

	// Create SSE stream with file watchers
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			const debounceTimers = new Map<string, NodeJS.Timeout>();

			let isStreamOpen = true;

			// Helper to safely enqueue data
			function safeEnqueue(data: string) {
				if (!isStreamOpen) return false;
				try {
					controller.enqueue(encoder.encode(data));
					return true;
				} catch {
					isStreamOpen = false;
					return false;
				}
			}

			// Send initial connection success
			safeEnqueue(`data: ${JSON.stringify({ type: 'connected', watching: linkedArticles.length })}\n\n`);

			// Keep-alive heartbeat
			const keepAlive = setInterval(() => {
				if (!safeEnqueue(`: keep-alive\n\n`)) {
					clearInterval(keepAlive);
				}
			}, KEEPALIVE_MS);

			// Set up watcher for each linked file using watchFile (polls, more reliable on macOS)
			for (const article of linkedArticles) {
				const { id, source_path } = article;

				if (!existsSync(source_path)) {
					log.warn('File not found, skipping watch', { articleId: id, path: source_path });
					continue;
				}

				try {
					// Get initial mtime
					let lastMtime = statSync(source_path).mtimeMs;

					// watchFile polls the file stat every 500ms
					watchFile(source_path, { interval: 500 }, (curr, prev) => {
						// Only trigger if mtime actually changed
						if (curr.mtimeMs === lastMtime) return;
						lastMtime = curr.mtimeMs;

						// Debounce rapid changes
						const existingTimer = debounceTimers.get(id);
						if (existingTimer) {
							clearTimeout(existingTimer);
						}

						debounceTimers.set(id, setTimeout(() => {
							debounceTimers.delete(id);

							if (!isStreamOpen) return;

							try {
								// Read fresh content
								if (!existsSync(source_path)) {
									safeEnqueue(`data: ${JSON.stringify({
										type: 'error',
										article_id: id,
										error: 'File deleted'
									})}\n\n`);
									return;
								}

								const content = readFileSync(source_path, 'utf-8');

								// Emit update event
								if (safeEnqueue(`data: ${JSON.stringify({
									type: 'update',
									article_id: id,
									content
								})}\n\n`)) {
									log.info('File change detected, sent update', { articleId: id });
								}
							} catch (readError) {
								log.error('Failed to read file', { articleId: id, error: readError });
								safeEnqueue(`data: ${JSON.stringify({
									type: 'error',
									article_id: id,
									error: 'Failed to read file'
								})}\n\n`);
							}
						}, DEBOUNCE_MS));
					});

					watchedPaths.push(source_path);
					log.info('Watching file', { articleId: id, path: source_path });
				} catch (watchError) {
					log.error('Failed to watch file', { articleId: id, error: watchError });
				}
			}

			// Cleanup on abort
			request.signal.addEventListener('abort', () => {
				log.info('Connection closed, cleaning up watchers');
				isStreamOpen = false;
				clearInterval(keepAlive);
				debounceTimers.forEach(timer => clearTimeout(timer));
				watchedPaths.forEach(path => unwatchFile(path));
				try {
					controller.close();
				} catch {
					// Already closed
				}
			});
		}
	});

	return new Response(stream, { headers: sseHeaders() });
};
