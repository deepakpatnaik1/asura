/**
 * Content Files API - List and Upload
 *
 * GET: List user's content files
 * POST: Upload and process pasted content, or link to Obsidian file
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, readFileSync } from 'fs';
import { basename } from 'path';
import { FIREWORKS_API_KEY } from '$env/static/private';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { createMessage } from '$lib/api/anthropic-client';
import { getModelProvider, assertProviderSupported } from '$lib/calls/chat/provider';
import { DEFAULT_MODEL } from '$lib/config/models';
import { FILE_ARTISAN_CUT_PROMPT } from '$lib/prompts/file-artisan-cut';
import { databaseError, validationError, internalError } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';
import { htmlToMarkdown } from '$lib/capabilities/image-extraction';
import { extractTitleFromHtml } from '$lib/capabilities';
import { extractAndSaveCharts } from '$lib/capabilities/content-extraction';

/**
 * Call Fireworks API for file artisan cut (non-streaming).
 */
async function callFireworksArtisanCut(model: string, systemPrompt: string, content: string): Promise<string> {
	const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${FIREWORKS_API_KEY}`
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content }
			],
			max_tokens: 8192,
			temperature: 0.3
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Fireworks API error: ${response.status} - ${error}`);
	}

	const data = await response.json();
	return data.choices?.[0]?.message?.content || '';
}

/** Max content size: 100KB */
const MAX_CONTENT_SIZE = 100 * 1024;

/**
 * Extract title from markdown content (first # heading) or use filename
 */
function extractTitleFromMarkdown(content: string, filePath?: string): string {
	// Look for first # heading
	const headingMatch = content.match(/^#\s+(.+)$/m);
	if (headingMatch) {
		return headingMatch[1].trim();
	}

	// Fall back to filename without extension
	if (filePath) {
		const filename = basename(filePath, '.md');
		return filename;
	}

	return 'Untitled';
}

/**
 * GET /api/chat/files
 * List user's content files (newest first)
 * Tiers: artisan_cut (AI compressed), raw (no processing)
 * Owners: no-one, persona names, everyone (shared across all personas)
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { data, error } = await supabase
		.from('articles')
		.select('id, title, is_enabled, is_starred, is_protected, tier, pending_annotation, source_path, created_at, owner')
		.eq('user_id', userId)
		.order('tier', { ascending: true }) // artisan_cut < raw (alphabetically ascending)
		.order('created_at', { ascending: false }); // Newest first within each group

	if (error) {
		return databaseError('Failed to fetch files');
	}

	return json({ files: data || [] });
};

/**
 * POST /api/chat/files
 * Upload and process pasted content, or link to Obsidian file
 */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const log = createLogger('FilesAPI', userId);

	// Parse request body
	const parseResult = await parseRequestJson<{ content?: string; source_path?: string; tier?: string; owner?: string }>(request);
	if (!parseResult.success) return parseResult.error;

	const { content, source_path, tier: requestTier, owner = 'no-one' } = parseResult.data;

	// Handle Obsidian file linking (source_path provided)
	if (source_path) {
		// Determine tier for linked files (default to raw if not specified)
		const tier = requestTier || 'raw';
		log.info('Linking Obsidian file', { sourcePath: source_path, tier });

		// Validate file exists and is readable
		if (!existsSync(source_path)) {
			return validationError(`File not found: ${source_path}`, 'source_path');
		}

		try {
			// Read file content
			const fileContent = readFileSync(source_path, 'utf-8');

			// Extract title from markdown or filename
			let title = extractTitleFromMarkdown(fileContent, source_path);
			let artisanCut: string | null = null;
			let artisanCutAt: Date | null = null;

			// Generate artisan cut if tier is artisan_cut
			if (tier === 'artisan_cut') {
				log.info('Generating artisan cut for linked file', { sourcePath: source_path });

				// Fetch user settings for compression model
				const { data: settings } = await supabase
					.from('user_settings')
					.select('default_model, model_file_artisan_cut')
					.eq('user_id', userId)
					.single();

				const model = settings?.model_file_artisan_cut || settings?.default_model || DEFAULT_MODEL;
				const provider = await getModelProvider(supabase, model);
				assertProviderSupported(provider);

				log.info('Using file artisan cut model', { model, provider, sourcePath: source_path });

				// Wrap content in XML tags to clearly separate it from conversation
				const wrappedFileContent = `<document>\n${fileContent}\n</document>\n\nProcess this document and return the JSON output.`;

				let responseText: string;

				if (provider === 'fireworks') {
					responseText = await callFireworksArtisanCut(model, FILE_ARTISAN_CUT_PROMPT, wrappedFileContent);
				} else {
					// Anthropic
					const response = await createMessage({
						model,
						max_tokens: 8192,
						temperature: 0.3,
						system: FILE_ARTISAN_CUT_PROMPT,
						messages: [{ role: 'user', content: wrappedFileContent }]
					});

					const textBlock = response.content.find((block) => block.type === 'text');
					if (!textBlock || textBlock.type !== 'text') {
						throw new Error('No text response from AI');
					}
					responseText = textBlock.text;
				}

				// Parse JSON response
				let parsed: { title: string; description: string };
				try {
					let jsonText = responseText.trim();
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
					log.error('Failed to parse AI response for linked file', { raw: responseText });
					throw new Error('Failed to parse AI response as JSON');
				}

				if (!parsed.title || !parsed.description) {
					throw new Error('AI response missing title or description');
				}

				title = parsed.title;
				artisanCut = parsed.description;
				artisanCutAt = new Date();
			}

			// Save to database with source_path
			const { data: file, error: insertError } = await supabase
				.from('articles')
				.insert({
					user_id: userId,
					title: title.slice(0, 255),
					raw_content: fileContent, // Store current content for fallback/search
					source_path: source_path, // Store path for live reading
					artisan_cut: artisanCut,
					artisan_cut_at: artisanCutAt,
					is_enabled: true, // Auto-select newly uploaded content
					tier,
					owner
				})
				.select('id, title')
				.single();

			if (insertError) {
				log.error('Failed to save linked file', { error: insertError.message });
				return databaseError('Failed to save linked file');
			}

			// Create superjournal entry
			const { data: sjEntry, error: sjError } = await supabase
				.from('superjournal')
				.insert({
					user_id: userId,
					persona_name: 'system',
					user_message: `Boss linked ${file.title}`,
					ai_response: `<!--content:${file.id}-->`,
					model_identifier: artisanCut ? 'file-link-artisan' : 'file-link',
					content_id: file.id
				})
				.select('id')
				.single();

			if (sjError) {
				log.warn('Failed to create superjournal entry', { error: sjError.message });
			}

			log.info('File linked successfully', {
				fileId: file.id,
				title: file.title,
				sourcePath: source_path,
				hasArtisanCut: !!artisanCut
			});

			// Note: Table extraction disabled for live-linked files
			// Table click-to-lightbox mapping is unreliable for dynamic content

			return json({
				success: true,
				file_id: file.id,
				title: file.title,
				content: fileContent,
				superjournal_id: sjEntry?.id,
				linked: true,
				has_artisan_cut: !!artisanCut
			});
		} catch (error) {
			log.error('Failed to read file', { error: error instanceof Error ? error.message : 'Unknown' });
			return validationError(`Cannot read file: ${source_path}`, 'source_path');
		}
	}

	// Regular content upload (existing behavior)
	// Determine tier from request, default to raw
	const tier = requestTier || 'raw';

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
		// Fetch user settings (default model + file compression model)
		const { data: settings } = await supabase
			.from('user_settings')
			.select('default_model, model_file_artisan_cut')
			.eq('user_id', userId)
			.single();

		// Use model_file_artisan_cut if set, otherwise fall back to default_model
		const model = settings?.model_file_artisan_cut || settings?.default_model || DEFAULT_MODEL;

		// Detect if content is HTML or already markdown
		// Check markdown patterns first - if it looks like markdown, don't run through Turndown
		// (prevents HTML inside code blocks from triggering false positives)
		const looksLikeMarkdown = /^(#{1,6}\s|---|```|\*\*|-\s|\d+\.\s)/m.test(content);
		const isHtml = !looksLikeMarkdown && /<[a-z][\s\S]*>/i.test(content);

		log.info('Processing file upload', {
			contentLength: content.length,
			tier,
			isHtml,
			contentStart: content.slice(0, 100)
		});

		// Convert HTML to Markdown, or pass through markdown as-is
		const readableContent = isHtml ? await htmlToMarkdown(content) : content.trim();

		let title: string;
		let artisanCut: string | null = null;

		if (tier === 'artisan_cut') {
			// Artisan cut tier: Call AI to generate title + artisan cut
			// Look up provider from database
			const provider = await getModelProvider(supabase, model);
			assertProviderSupported(provider);

			log.info('Using file artisan cut model', { model, provider });

			// Wrap content in XML tags to clearly separate it from conversation
			// This prevents the model from interpreting document text as instructions
			const wrappedContent = `<document>\n${content}\n</document>\n\nProcess this document and return the JSON output.`;

			let responseText: string;

			if (provider === 'fireworks') {
				responseText = await callFireworksArtisanCut(model, FILE_ARTISAN_CUT_PROMPT, wrappedContent);
			} else {
				// Anthropic
				const response = await createMessage({
					model,
					max_tokens: 8192,
					temperature: 0.3,
					system: FILE_ARTISAN_CUT_PROMPT,
					messages: [{ role: 'user', content: wrappedContent }]
				});

				const textBlock = response.content.find((block) => block.type === 'text');
				if (!textBlock || textBlock.type !== 'text') {
					throw new Error('No text response from AI');
				}
				responseText = textBlock.text;
			}

			// Parse JSON response
			let parsed: { title: string; description: string };
			try {
				let jsonText = responseText.trim();
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
				log.error('Failed to parse AI response', { raw: responseText });
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
			.from('articles')
			.insert({
				user_id: userId,
				title: title.slice(0, 255),
				raw_content: readableContent,
				artisan_cut: artisanCut,
				is_enabled: true, // Auto-select newly uploaded content
				tier,
				owner
			})
			.select('id, title')
			.single();

		if (insertError) {
			log.error('Failed to save file', { error: insertError.message });
			return databaseError('Failed to save file');
		}

		// Create superjournal entry for display
		// Stores only marker; content fetched from content table on display
		// Use 'system' as persona_name so content turns don't pollute any persona's working/recent memory
		const { data: sjEntry, error: sjError } = await supabase
			.from('superjournal')
			.insert({
				user_id: userId,
				persona_name: 'system',
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
