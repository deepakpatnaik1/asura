import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError } from '$lib/api/errors';
import { checkRateLimit, LIMITS } from '$lib/api/rate-limit';
import { createLogger } from '$lib/api/logger';

const EXPORT_SCHEMA_VERSION = '1.0.0';

// Rate limit: 1 export per hour (expensive operation)
const EXPORT_LIMIT = { maxRequests: 1, windowMs: 60 * 60 * 1000 };

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const log = createLogger('ExportAPI');

	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. RATE LIMIT CHECK
	const rateLimitResult = checkRateLimit(userId, 'export', EXPORT_LIMIT);
	if (!rateLimitResult.allowed) {
		return rateLimitResult.response!;
	}

	log.info('Starting data export', { userId });

	try {
		// 3. FETCH ALL USER DATA IN PARALLEL
		const [
			superjournalResult,
			superjournalChartsResult,
			journalResult,
			articlesResult,
			articleChartsResult,
			articleChatResult,
			articleChatChartsResult,
			filesResult,
			fileChartsResult,
			settingsResult
		] = await Promise.all([
			supabase
				.from('superjournal')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false }),
			supabase
				.from('superjournal_charts')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false }),
			supabase
				.from('journal')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false }),
			supabase
				.from('articles')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false }),
			supabase
				.from('article_charts')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false }),
			supabase
				.from('article_chat')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false }),
			supabase
				.from('article_chat_charts')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false }),
			supabase
				.from('files')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false }),
			supabase
				.from('file_charts')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false }),
			supabase
				.from('user_settings')
				.select('*')
				.eq('user_id', userId)
				.single()
		]);

		// Check for errors (settings may not exist for new users)
		const errors = [
			superjournalResult.error,
			superjournalChartsResult.error,
			journalResult.error,
			articlesResult.error,
			articleChartsResult.error,
			articleChatResult.error,
			articleChatChartsResult.error,
			filesResult.error,
			fileChartsResult.error
		].filter(Boolean);

		if (errors.length > 0) {
			log.error('Export query failed', { errors });
			return databaseError('Failed to export data');
		}

		// 4. BUILD EXPORT OBJECT
		const exportData = {
			meta: {
				schema_version: EXPORT_SCHEMA_VERSION,
				exported_at: new Date().toISOString(),
				user_id: userId
			},
			data: {
				superjournal: superjournalResult.data || [],
				superjournal_charts: superjournalChartsResult.data || [],
				journal: journalResult.data || [],
				articles: articlesResult.data || [],
				article_charts: articleChartsResult.data || [],
				article_chat: articleChatResult.data || [],
				article_chat_charts: articleChatChartsResult.data || [],
				files: filesResult.data || [],
				file_charts: fileChartsResult.data || [],
				settings: settingsResult.data || null
			},
			counts: {
				superjournal: superjournalResult.data?.length || 0,
				superjournal_charts: superjournalChartsResult.data?.length || 0,
				journal: journalResult.data?.length || 0,
				articles: articlesResult.data?.length || 0,
				article_charts: articleChartsResult.data?.length || 0,
				article_chat: articleChatResult.data?.length || 0,
				article_chat_charts: articleChatChartsResult.data?.length || 0,
				files: filesResult.data?.length || 0,
				file_charts: fileChartsResult.data?.length || 0
			}
		};

		log.info('Export complete', { counts: exportData.counts });

		// 5. RETURN AS JSON WITH DOWNLOAD HEADERS
		return new Response(JSON.stringify(exportData, null, 2), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="asura-export-${new Date().toISOString().split('T')[0]}.json"`
			}
		});
	} catch (error) {
		log.error('Export failed', { error });
		return databaseError('Failed to export data');
	}
};
