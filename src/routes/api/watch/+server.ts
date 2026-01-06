/**
 * File Watch API - SSE endpoint for live Obsidian file updates
 *
 * Uses chokidar for reliable file watching on macOS (handles atomic saves)
 */

import chokidar from 'chokidar';
import { existsSync, readFileSync } from 'fs';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { sseHeaders } from '$lib/api/stream-protocol';
import { validationError } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';

/** Debounce delay to avoid rapid-fire updates (500ms = patient, waits for typing to settle) */
const DEBOUNCE_MS = 500;

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

	// Build path -> article_id map for quick lookup
	const pathToId = new Map<string, string>();
	const pathsToWatch: string[] = [];

	for (const article of linkedArticles) {
		if (existsSync(article.source_path)) {
			pathToId.set(article.source_path, article.id);
			pathsToWatch.push(article.source_path);
		}
	}

	if (pathsToWatch.length === 0) {
		const stream = new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', message: 'No valid files to watch' })}\n\n`));
				controller.close();
			}
		});
		return new Response(stream, { headers: sseHeaders() });
	}

	// Create SSE stream with chokidar file watcher
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
			safeEnqueue(`data: ${JSON.stringify({ type: 'connected', watching: pathsToWatch.length })}\n\n`);

			// Keep-alive heartbeat
			const keepAlive = setInterval(() => {
				if (!safeEnqueue(`: keep-alive\n\n`)) {
					clearInterval(keepAlive);
				}
			}, KEEPALIVE_MS);

			// Initialize chokidar watcher
			// awaitWriteFinish helps with atomic saves - waits for file to stabilize
			// Patient settings: 500ms stability, 200ms poll = checks 2.5x/sec instead of 20x/sec
			log.info('Starting chokidar watcher', {
				fileCount: pathsToWatch.length,
				samplePath: pathsToWatch[0]?.slice(-60)
			});
			const watcher = chokidar.watch(pathsToWatch, {
				persistent: true,
				ignoreInitial: true,
				// Use polling to reliably catch Obsidian's atomic saves (write temp → rename)
				// FSEvents misses renames; polling checks mtime every 1s
				usePolling: true,
				interval: 1000
			});

			// Handle file changes
			watcher.on('change', (filePath: string) => {
				log.info('Chokidar detected change', { filePath: filePath.slice(-50) });
				const articleId = pathToId.get(filePath);
				if (!articleId) {
					log.warn('No article ID for path', { filePath: filePath.slice(-50) });
					return;
				}

				// Debounce rapid changes
				const existingTimer = debounceTimers.get(articleId);
				if (existingTimer) {
					clearTimeout(existingTimer);
				}

				debounceTimers.set(articleId, setTimeout(() => {
					debounceTimers.delete(articleId);

					if (!isStreamOpen) return;

					try {
						// Read fresh content
						if (!existsSync(filePath)) {
							log.warn('File deleted during watch', { articleId: articleId.slice(0,8) });
							safeEnqueue(`data: ${JSON.stringify({
								type: 'error',
								article_id: articleId,
								error: 'File deleted'
							})}\n\n`);
							return;
						}

						const content = readFileSync(filePath, 'utf-8');
						log.info('Sending SSE update', { articleId: articleId.slice(0,8), contentLength: content.length });

						// Emit update event
						const sent = safeEnqueue(`data: ${JSON.stringify({
							type: 'update',
							article_id: articleId,
							content
						})}\n\n`);
						if (!sent) {
							log.warn('SSE update failed - stream closed', { articleId: articleId.slice(0,8) });
						}
					} catch (readError) {
						safeEnqueue(`data: ${JSON.stringify({
							type: 'error',
							article_id: articleId,
							error: 'Failed to read file'
						})}\n\n`);
					}
				}, DEBOUNCE_MS));
			});

			// Log when watcher is ready
			watcher.on('ready', () => {
				log.info('Chokidar watcher ready', { watchedPaths: pathsToWatch.length });
			});

			// Handle watcher errors
			watcher.on('error', (error: unknown) => {
				const message = error instanceof Error ? error.message : String(error);
				log.error('Chokidar watcher error', { error: message });
			});

			// Cleanup on abort
			request.signal.addEventListener('abort', () => {
				isStreamOpen = false;
				clearInterval(keepAlive);
				debounceTimers.forEach(timer => clearTimeout(timer));
				watcher.close();
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
