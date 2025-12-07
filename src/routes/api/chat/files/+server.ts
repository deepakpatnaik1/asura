/**
 * Content Files API - List and Upload
 *
 * GET: List user's content files
 * POST: Upload and process pasted content, extract images and tables
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { createMessage } from '$lib/api/anthropic-client';
import { DEFAULT_CHAT_MODEL } from '$lib/config/models';
import { DEFAULT_PERSONA } from '$lib/config/personas';
import { FILE_ARTISAN_CUT_PROMPT } from '$lib/prompts/file-artisan-cut';
import { databaseError, validationError, internalError } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';
import { htmlToMarkdown } from '$lib/capabilities/image-extraction';
import { extractTitleFromHtml } from '$lib/capabilities';
import { extractAndSaveCharts } from '$lib/capabilities/content-extraction';

/** Max content size: 100KB */
const MAX_CONTENT_SIZE = 100 * 1024;

/**
 * GET /api/chat/files
 * List user's content files, sorted by creation date (newest first)
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { data, error } = await supabase
		.from('content')
		.select('id, title, is_enabled, is_canon, created_at')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });

	if (error) {
		return databaseError('Failed to fetch files');
	}

	return json({ files: data || [] });
};

/**
 * POST /api/chat/files
 * Upload and process pasted content
 */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const log = createLogger('FilesAPI', userId);

	// Parse request body
	const parseResult = await parseRequestJson<{ content: string; persistent?: boolean; persona?: string; is_canon?: boolean }>(request);
	if (!parseResult.success) return parseResult.error;

	const { content, persistent = false, persona: requestPersona, is_canon = false } = parseResult.data;

	// Validate content
	if (!content || typeof content !== 'string') {
		return validationError('Content is required', 'content');
	}

	if (content.length > MAX_CONTENT_SIZE) {
		return validationError(`Content exceeds maximum size of ${MAX_CONTENT_SIZE / 1024}KB`, 'content');
	}

	if (content.trim().length === 0) {
		return validationError('Content cannot be empty', 'content');
	}

	try {
		// Fetch user settings (default model + persona)
		const { data: settings } = await supabase
			.from('user_settings')
			.select('default_model, selected_persona')
			.eq('user_id', userId)
			.single();

		const model = settings?.default_model || DEFAULT_CHAT_MODEL;
		const persona = requestPersona || settings?.selected_persona || DEFAULT_PERSONA;

		// Detect if content is HTML or already markdown
		// HTML has tags like <p>, <div>, <html>, etc. Plain markdown doesn't
		const isHtml = /<[a-z][\s\S]*>/i.test(content);

		log.info('Processing file upload', {
			contentLength: content.length,
			persistent,
			isHtml,
			contentStart: content.slice(0, 100)
		});

		// Convert HTML to Markdown, or pass through markdown as-is
		const readableContent = isHtml ? await htmlToMarkdown(content) : content.trim();

		let title: string;
		let artisanCut: string | null = null;

		if (persistent) {
			// Persistent: Call AI to generate title + artisan cut
			const response = await createMessage({
				model,
				max_tokens: 2048,
				temperature: 0.3,
				system: FILE_ARTISAN_CUT_PROMPT,
				messages: [{ role: 'user', content }]
			});

			const textBlock = response.content.find((block) => block.type === 'text');
			if (!textBlock || textBlock.type !== 'text') {
				throw new Error('No text response from AI');
			}

			// Parse JSON response
			let parsed: { title: string; description: string };
			try {
				let jsonText = textBlock.text.trim();
				const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
				if (jsonMatch) {
					jsonText = jsonMatch[1].trim();
				}
				const objectMatch = jsonText.match(/\{[\s\S]*\}/);
				if (objectMatch) {
					jsonText = objectMatch[0];
				}
				parsed = JSON.parse(jsonText);
			} catch (e) {
				log.error('Failed to parse AI response', { raw: textBlock.text });
				throw new Error('Failed to parse AI response as JSON');
			}

			if (!parsed.title || !parsed.description) {
				throw new Error('AI response missing title or description');
			}

			title = parsed.title;
			artisanCut = parsed.description;
		} else {
			// Ephemeral: Extract title from HTML directly, no artisan cut
			title = await extractTitleFromHtml(content);
		}

		// Save to database (store readable text, not raw HTML)
		const { data: file, error: insertError } = await supabase
			.from('content')
			.insert({
				user_id: userId,
				title: title.slice(0, 255),
				raw_content: readableContent,
				artisan_cut: artisanCut,
				is_enabled: true, // Auto-select on paste
				is_canon
			})
			.select('id, title')
			.single();

		if (insertError) {
			log.error('Failed to save file', { error: insertError.message });
			return databaseError('Failed to save file');
		}

		// Create superjournal entry for display
		// Stores only marker; content fetched from content table on display
		const { data: sjEntry, error: sjError } = await supabase
			.from('superjournal')
			.insert({
				user_id: userId,
				persona_name: persona,
				user_message: `Boss uploaded ${file.title}`,
				ai_response: `<!--content:${file.id}-->`,
				model_identifier: 'file-upload',
				content_id: file.id // Link superjournal entry to content
			})
			.select('id')
			.single();

		if (sjError) {
			log.warn('Failed to create superjournal entry', { error: sjError.message });
		}

		log.info('File saved, extracting images and tables', { fileId: file.id, superjournalId: sjEntry?.id });

		// Extract images and tables from content
		const { chartCount } = await extractAndSaveCharts({
			content,
			userId,
			contentId: file.id,
			supabase,
			log
		});

		log.info('File uploaded successfully', {
			fileId: file.id,
			title: file.title,
			chartCount
		});

		return json({
			success: true,
			file_id: file.id,
			title: file.title,
			content: readableContent,
			superjournal_id: sjEntry?.id,
			chart_count: chartCount
		});
	} catch (error) {
		log.error('File upload failed', {
			error: error instanceof Error ? error.message : 'Unknown'
		});
		return internalError('Failed to process file');
	}
};
