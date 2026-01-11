import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError, internalError, badRequest } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';

/**
 * Granular Nuke Endpoint
 *
 * POST /api/nuke
 * Body: { bucket?: string }
 *
 * Buckets:
 * - persona:<name>     → Delete superjournal/journal for that persona
 * - content:raw        → Delete raw content (tier = 'ephemeral', no artisan cut)
 * - content:artisan    → Delete artisan cut content (tier = 'strategic')
 * - content:canon      → Delete foundational content (tier = 'canon')
 * - content:images     → Delete uploaded images
 * - content:linked     → Delete live-linked Obsidian files
 * - canvas:designer    → Delete Eva's designer canvases
 * - canvas:whiteboard  → Delete Gunnar's whiteboard canvases
 * - productivity:diary → Delete founder_diary entries
 * - productivity:todos → Delete todos + tags
 *
 * If no bucket specified, deletes ALL data (backwards compatible).
 *
 * Response: { success: true, deleted: { ... } } or { error: { message, code } }
 */

const VALID_BUCKETS = [
	'persona:gunnar',
	'persona:kirby',
	'persona:samara',
	'persona:alicja',
	'persona:eva',
	'persona:ananya',
	'persona:felix',
	'content:raw',
	'content:artisan',
	'content:canon',
	'content:images',
	'content:linked',
	'canvas:designer',
	'canvas:whiteboard',
	'productivity:diary',
	'productivity:todos'
] as const;

type Bucket = typeof VALID_BUCKETS[number];

function isValidBucket(bucket: string): bucket is Bucket {
	return VALID_BUCKETS.includes(bucket as Bucket);
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const log = createLogger('NukeAPI');

	try {
		// 1. AUTHENTICATION CHECK
		const auth = await requireAuth(safeGetSession);
		if (!auth.success) return auth.error;
		const { userId } = auth;

		// 2. PARSE BUCKET
		const body = await request.json().catch(() => ({}));
		const bucket = body.bucket as string | undefined;

		// Validate bucket if provided
		if (bucket && !isValidBucket(bucket)) {
			return badRequest(`Invalid bucket: ${bucket}`);
		}

		log.info('Starting nuke', { userId, bucket: bucket || 'ALL' });

		// 3. EXECUTE NUKE BASED ON BUCKET
		if (!bucket) {
			// Nuke everything (backwards compatible)
			return await nukeAll(supabase, userId, log);
		}

		// Parse bucket type and target
		const [bucketType, target] = bucket.split(':');

		switch (bucketType) {
			case 'persona':
				return await nukePersona(supabase, userId, target, log);
			case 'content':
				return await nukeContent(supabase, userId, target, log);
			case 'canvas':
				return await nukeCanvas(supabase, userId, target, log);
			case 'productivity':
				return await nukeProductivity(supabase, userId, target, log);
			default:
				return badRequest(`Unknown bucket type: ${bucketType}`);
		}
	} catch (error) {
		log.error('Nuke operation failed', { error });
		return internalError('Unexpected error during nuke operation');
	}
};

/**
 * Nuke all data (backwards compatible)
 */
async function nukeAll(supabase: App.Locals['supabase'], userId: string, log: ReturnType<typeof createLogger>) {
	// Fetch all charts for storage cleanup
	const { data: allCharts } = await supabase
		.from('article_charts')
		.select('storage_path, thumbnail_path')
		.eq('user_id', userId);

	// Collect storage paths
	const storagePaths: string[] = [];
	if (allCharts) {
		for (const chart of allCharts) {
			if (chart.storage_path) storagePaths.push(chart.storage_path);
			if (chart.thumbnail_path) storagePaths.push(chart.thumbnail_path);
		}
	}

	// Delete from storage
	if (storagePaths.length > 0) {
		const { error: storageError } = await supabase.storage
			.from('articles')
			.remove(storagePaths);
		if (storageError) {
			log.warn('Failed to delete chart files from storage', { error: storageError });
		}
	}

	// Delete content (cascades to charts)
	const { error: contentError } = await supabase
		.from('articles')
		.delete()
		.eq('user_id', userId);

	if (contentError) {
		log.error('Failed to delete content', { error: contentError });
		return databaseError('Failed to delete content');
	}

	// Delete superjournal (cascades to journal and charts)
	const { error: superjournalError } = await supabase
		.from('superjournal')
		.delete()
		.eq('user_id', userId);

	if (superjournalError) {
		log.error('Failed to delete superjournal', { error: superjournalError });
		return databaseError('Failed to delete superjournal data');
	}

	// Delete productivity data
	const { data: deletedTodos } = await supabase
		.from('canvas_planner_todos')
		.delete()
		.eq('user_id', userId)
		.select('id');

	const { data: deletedTags } = await supabase
		.from('canvas_planner_tags')
		.delete()
		.eq('user_id', userId)
		.select('id');

	const { data: deletedDiary } = await supabase
		.from('canvas_planner_diary')
		.delete()
		.eq('user_id', userId)
		.select('id');

	log.info('Nuke ALL complete', {
		storageFilesDeleted: storagePaths.length,
		todosDeleted: deletedTodos?.length || 0,
		tagsDeleted: deletedTags?.length || 0,
		diaryDeleted: deletedDiary?.length || 0
	});

	return json({
		success: true,
		bucket: 'ALL',
		deleted: {
			storage_files: storagePaths.length,
			todos: deletedTodos?.length || 0,
			tags: deletedTags?.length || 0,
			diary: deletedDiary?.length || 0
		}
	});
}

/**
 * Nuke a specific persona's conversations
 */
async function nukePersona(supabase: App.Locals['supabase'], userId: string, personaName: string, log: ReturnType<typeof createLogger>) {
	// Get superjournal IDs for this persona (for chart cleanup)
	const { data: superjournalIds } = await supabase
		.from('superjournal')
		.select('id')
		.eq('user_id', userId)
		.eq('persona_name', personaName);

	const ids = superjournalIds?.map(s => s.id) || [];

	// Get charts linked to these superjournal entries
	let storagePaths: string[] = [];
	if (ids.length > 0) {
		const { data: charts } = await supabase
			.from('article_charts')
			.select('storage_path, thumbnail_path')
			.eq('user_id', userId)
			.in('superjournal_id', ids);

		if (charts) {
			for (const chart of charts) {
				if (chart.storage_path) storagePaths.push(chart.storage_path);
				if (chart.thumbnail_path) storagePaths.push(chart.thumbnail_path);
			}
		}
	}

	// Delete from storage
	if (storagePaths.length > 0) {
		const { error: storageError } = await supabase.storage
			.from('articles')
			.remove(storagePaths);
		if (storageError) {
			log.warn('Failed to delete chart files from storage', { error: storageError });
		}
	}

	// Delete superjournal entries for this persona (cascades to journal and charts)
	const { data: deleted, error } = await supabase
		.from('superjournal')
		.delete()
		.eq('user_id', userId)
		.eq('persona_name', personaName)
		.select('id');

	if (error) {
		log.error('Failed to delete persona conversations', { error, personaName });
		return databaseError(`Failed to delete ${personaName} conversations`);
	}

	log.info('Nuke persona complete', {
		personaName,
		messagesDeleted: deleted?.length || 0,
		storageFilesDeleted: storagePaths.length
	});

	return json({
		success: true,
		bucket: `persona:${personaName}`,
		deleted: {
			messages: deleted?.length || 0,
			storage_files: storagePaths.length
		}
	});
}

/**
 * Nuke content by type
 *
 * Types:
 * - raw: tier='ephemeral', NOT image, NOT linked (text/PDFs without artisan cut)
 * - artisan: tier='strategic', NOT image, NOT linked (text/PDFs with artisan cut)
 * - canon: tier='canon' (foundational content)
 * - images: raw_content LIKE '[Uploaded image:%' (uploaded images)
 * - linked: source_path IS NOT NULL (live-linked Obsidian files)
 */
async function nukeContent(supabase: App.Locals['supabase'], userId: string, contentType: string, log: ReturnType<typeof createLogger>) {
	// Build query based on content type
	let query = supabase.from('articles').select('id').eq('user_id', userId);

	switch (contentType) {
		case 'raw':
			// Ephemeral tier, NOT images, NOT linked
			query = query
				.eq('tier', 'ephemeral')
				.is('source_path', null)
				.not('raw_content', 'like', '[Uploaded image:%');
			break;
		case 'artisan':
			// Strategic tier, NOT images, NOT linked
			query = query
				.eq('tier', 'strategic')
				.is('source_path', null)
				.not('raw_content', 'like', '[Uploaded image:%');
			break;
		case 'canon':
			// Canon tier (all canon content)
			query = query.eq('tier', 'canon');
			break;
		case 'images':
			// Uploaded images (identified by raw_content pattern)
			query = query.like('raw_content', '[Uploaded image:%');
			break;
		case 'linked':
			// Live-linked Obsidian files (have source_path)
			query = query.not('source_path', 'is', null);
			break;
		default:
			return badRequest(`Unknown content type: ${contentType}`);
	}

	const { data: contentIds, error: fetchError } = await query;

	if (fetchError) {
		log.error('Failed to fetch content for nuke', { error: fetchError, contentType });
		return databaseError(`Failed to fetch ${contentType} content`);
	}

	if (!contentIds || contentIds.length === 0) {
		log.info('No content to delete', { contentType });
		return json({
			success: true,
			bucket: `content:${contentType}`,
			deleted: { content: 0, storage_files: 0 }
		});
	}

	const ids = contentIds.map(c => c.id);

	// Get charts linked to this content (for storage cleanup)
	const { data: charts } = await supabase
		.from('article_charts')
		.select('storage_path, thumbnail_path')
		.eq('user_id', userId)
		.in('content_id', ids);

	const storagePaths: string[] = [];
	if (charts) {
		for (const chart of charts) {
			if (chart.storage_path) storagePaths.push(chart.storage_path);
			if (chart.thumbnail_path) storagePaths.push(chart.thumbnail_path);
		}
	}

	// Delete from storage
	if (storagePaths.length > 0) {
		const { error: storageError } = await supabase.storage
			.from('content')
			.remove(storagePaths);
		if (storageError) {
			log.warn('Failed to delete chart files from storage', { error: storageError });
		}
	}

	// Delete superjournal entries that reference this content via <!--content:uuid--> markers
	// This also cascades to journal entries
	let superjournalDeleted = 0;
	for (const id of ids) {
		const { data: deleted } = await supabase
			.from('superjournal')
			.delete()
			.eq('user_id', userId)
			.like('ai_response', `<!--content:${id}-->%`)
			.select('id');
		superjournalDeleted += deleted?.length || 0;
	}

	// Delete the content (cascades to charts)
	const { error: deleteError } = await supabase
		.from('articles')
		.delete()
		.in('id', ids);

	if (deleteError) {
		log.error('Failed to delete content', { error: deleteError, contentType });
		return databaseError(`Failed to delete ${contentType} content`);
	}

	log.info('Nuke content complete', {
		contentType,
		contentDeleted: ids.length,
		superjournalDeleted,
		storageFilesDeleted: storagePaths.length
	});

	return json({
		success: true,
		bucket: `content:${contentType}`,
		deleted: {
			content: ids.length,
			superjournal: superjournalDeleted,
			storage_files: storagePaths.length
		}
	});
}

/**
 * Nuke canvases by type
 *
 * Types:
 * - designer: Eva's character design canvases
 * - whiteboard: Gunnar's whiteboard canvases
 */
async function nukeCanvas(supabase: App.Locals['supabase'], userId: string, canvasType: string, log: ReturnType<typeof createLogger>) {
	let tableName: string;

	switch (canvasType) {
		case 'designer':
			tableName = 'canvas_designer';
			break;
		case 'whiteboard':
			tableName = 'canvas_whiteboard';
			break;
		default:
			return badRequest(`Unknown canvas type: ${canvasType}`);
	}

	const { data: deleted, error } = await supabase
		.from(tableName)
		.delete()
		.eq('user_id', userId)
		.select('id');

	if (error) {
		log.error('Failed to delete canvases', { error, canvasType });
		return databaseError(`Failed to delete ${canvasType} canvases`);
	}

	log.info('Nuke canvas complete', {
		canvasType,
		canvasesDeleted: deleted?.length || 0
	});

	return json({
		success: true,
		bucket: `canvas:${canvasType}`,
		deleted: {
			canvases: deleted?.length || 0
		}
	});
}

/**
 * Nuke productivity data
 */
async function nukeProductivity(supabase: App.Locals['supabase'], userId: string, target: string, log: ReturnType<typeof createLogger>) {
	switch (target) {
		case 'diary': {
			const { data: deleted, error } = await supabase
				.from('canvas_planner_diary')
				.delete()
				.eq('user_id', userId)
				.select('id');

			if (error) {
				log.error('Failed to delete founder diary', { error });
				return databaseError('Failed to delete founder diary');
			}

			log.info('Nuke diary complete', { entriesDeleted: deleted?.length || 0 });

			return json({
				success: true,
				bucket: 'productivity:diary',
				deleted: { diary_entries: deleted?.length || 0 }
			});
		}

		case 'todos': {
			// Delete todos first, then tags
			const { data: deletedTodos, error: todosError } = await supabase
				.from('canvas_planner_todos')
				.delete()
				.eq('user_id', userId)
				.select('id');

			if (todosError) {
				log.error('Failed to delete todos', { error: todosError });
				return databaseError('Failed to delete todos');
			}

			const { data: deletedTags, error: tagsError } = await supabase
				.from('canvas_planner_tags')
				.delete()
				.eq('user_id', userId)
				.select('id');

			if (tagsError) {
				log.error('Failed to delete tags', { error: tagsError });
				return databaseError('Failed to delete tags');
			}

			log.info('Nuke todos complete', {
				todosDeleted: deletedTodos?.length || 0,
				tagsDeleted: deletedTags?.length || 0
			});

			return json({
				success: true,
				bucket: 'productivity:todos',
				deleted: {
					todos: deletedTodos?.length || 0,
					tags: deletedTags?.length || 0
				}
			});
		}

		default:
			return badRequest(`Unknown productivity target: ${target}`);
	}
}
