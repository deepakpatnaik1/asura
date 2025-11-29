/**
 * Chat Files API - List and Upload
 *
 * GET: List all user's files
 * POST: Upload and process pasted content, extract images and tables
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { createMessage } from '$lib/api/anthropic-client';
import { DEFAULT_COMPRESSION_MODEL } from '$lib/config/models';
import { FILE_ARTISAN_CUT_PROMPT } from '$lib/prompts/file-artisan-cut';
import { databaseError, validationError, internalError } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';
import {
	extractImages,
	extractHtmlTables,
	htmlToPlainText,
	downloadImage,
	generateThumbnail,
	getImageExtension,
	uploadImageToStorage,
	uploadThumbnailToStorage,
	uploadSvgToStorage
} from '$lib/capabilities/image-extraction';
import {
	extractMarkdownTables,
	renderTableToSvg,
	svgToPng
} from '$lib/capabilities/table-extraction';

/** Max content size: 100KB */
const MAX_CONTENT_SIZE = 100 * 1024;

/**
 * GET /api/chat/files
 * List all user's files sorted by creation date (newest first)
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { data, error } = await supabase
		.from('files')
		.select('id, title, is_enabled, created_at')
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
	const parseResult = await parseRequestJson<{ content: string }>(request);
	if (!parseResult.success) return parseResult.error;

	const { content } = parseResult.data;

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
		log.info('Processing file upload', { contentLength: content.length });

		// Fetch user's compression model preference
		const { data: settings } = await supabase
			.from('user_settings')
			.select('selected_compression_model')
			.eq('user_id', userId)
			.single();

		const model = settings?.selected_compression_model || DEFAULT_COMPRESSION_MODEL;

		// Call AI to generate artisan cut
		const response = await createMessage({
			model,
			max_tokens: 2048,
			temperature: 0.3,
			system: FILE_ARTISAN_CUT_PROMPT,
			messages: [{ role: 'user', content }]
		});

		// Extract text response
		const textBlock = response.content.find((block) => block.type === 'text');
		if (!textBlock || textBlock.type !== 'text') {
			throw new Error('No text response from AI');
		}

		// Parse JSON response
		let parsed: { title: string; description: string };
		try {
			// Handle potential markdown code blocks
			let jsonText = textBlock.text.trim();
			const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (jsonMatch) {
				jsonText = jsonMatch[1].trim();
			}
			// Extract JSON object if there's other text
			const objectMatch = jsonText.match(/\{[\s\S]*\}/);
			if (objectMatch) {
				jsonText = objectMatch[0];
			}
			parsed = JSON.parse(jsonText);
		} catch (e) {
			log.error('Failed to parse AI response', { raw: textBlock.text });
			throw new Error('Failed to parse AI response as JSON');
		}

		// Validate parsed response
		if (!parsed.title || !parsed.description) {
			throw new Error('AI response missing title or description');
		}

		// Save to database
		const { data: file, error: insertError } = await supabase
			.from('files')
			.insert({
				user_id: userId,
				title: parsed.title.slice(0, 255), // Truncate to reasonable length
				raw_content: content,
				artisan_cut: parsed.description,
				is_enabled: false
			})
			.select('id, title')
			.single();

		if (insertError) {
			log.error('Failed to save file', { error: insertError.message });
			return databaseError('Failed to save file');
		}

		log.info('File saved, extracting images and tables', { fileId: file.id });

		// Extract images and tables from content
		const chartResults: Array<{
			index: number;
			storage_path: string;
			thumbnail_path: string;
			alt_text: string;
		}> = [];

		// 1. Extract <img> tags
		const images = extractImages(content);
		for (const image of images) {
			try {
				const imageBuffer = await downloadImage(image.src);
				const imageExt = getImageExtension(imageBuffer);
				const thumbnailBuffer = await generateThumbnail(imageBuffer);

				const imagePath = `file-images/${userId}/${file.id}/chart-${image.index}.${imageExt}`;
				const thumbnailPath = `file-thumbnails/${userId}/${file.id}/chart-${image.index}.jpg`;

				await uploadImageToStorage(imageBuffer, 'files', imagePath);
				await uploadThumbnailToStorage(thumbnailBuffer, 'files', thumbnailPath);

				chartResults.push({
					index: image.index,
					storage_path: imagePath,
					thumbnail_path: thumbnailPath,
					alt_text: image.alt || `Image ${image.index}`
				});
			} catch (err) {
				log.warn('Failed to process image', { index: image.index, error: err instanceof Error ? err.message : 'Unknown' });
			}
		}

		// 2. Extract HTML tables
		const htmlTables = extractHtmlTables(content, images.length);
		for (const table of htmlTables) {
			try {
				const { svg, width } = await renderTableToSvg(table.headers, table.rows);
				const svgBuffer = Buffer.from(svg, 'utf-8');
				const pngBuffer = svgToPng(svg, width);
				const thumbnailBuffer = await generateThumbnail(pngBuffer);

				const storagePath = `file-images/${userId}/${file.id}/table-${table.index}.svg`;
				const thumbnailPath = `file-thumbnails/${userId}/${file.id}/chart-${table.index}.jpg`;

				await uploadSvgToStorage(svgBuffer, 'files', storagePath);
				await uploadThumbnailToStorage(thumbnailBuffer, 'files', thumbnailPath);

				chartResults.push({
					index: table.index,
					storage_path: storagePath,
					thumbnail_path: thumbnailPath,
					alt_text: `Table with ${table.headers.length} columns and ${table.rows.length} rows`
				});
			} catch (err) {
				log.warn('Failed to process HTML table', { index: table.index, error: err instanceof Error ? err.message : 'Unknown' });
			}
		}

		// 3. Extract markdown tables
		const plainText = htmlToPlainText(content);
		const mdTables = extractMarkdownTables(plainText, images.length + htmlTables.length);
		for (const table of mdTables) {
			try {
				const { svg, width } = await renderTableToSvg(table.headers, table.rows);
				const svgBuffer = Buffer.from(svg, 'utf-8');
				const pngBuffer = svgToPng(svg, width);
				const thumbnailBuffer = await generateThumbnail(pngBuffer);

				const storagePath = `file-images/${userId}/${file.id}/table-${table.index}.svg`;
				const thumbnailPath = `file-thumbnails/${userId}/${file.id}/chart-${table.index}.jpg`;

				await uploadSvgToStorage(svgBuffer, 'files', storagePath);
				await uploadThumbnailToStorage(thumbnailBuffer, 'files', thumbnailPath);

				chartResults.push({
					index: table.index,
					storage_path: storagePath,
					thumbnail_path: thumbnailPath,
					alt_text: table.caption || `Table with ${table.headers.length} columns and ${table.rows.length} rows`
				});
			} catch (err) {
				log.warn('Failed to process markdown table', { index: table.index, error: err instanceof Error ? err.message : 'Unknown' });
			}
		}

		// 4. Insert chart records into database
		if (chartResults.length > 0) {
			const chartRecords = chartResults.map((chart) => ({
				file_id: file.id,
				user_id: userId,
				chart_index: chart.index,
				storage_path: chart.storage_path,
				thumbnail_path: chart.thumbnail_path,
				alt_text: chart.alt_text
			}));

			const { error: chartInsertError } = await supabase
				.from('file_charts')
				.insert(chartRecords);

			if (chartInsertError) {
				log.warn('Failed to save chart records', { error: chartInsertError.message });
			}
		}

		log.info('File uploaded successfully', {
			fileId: file.id,
			title: file.title,
			chartCount: chartResults.length
		});

		return json({
			success: true,
			file_id: file.id,
			title: file.title,
			chart_count: chartResults.length
		});
	} catch (error) {
		log.error('File upload failed', {
			error: error instanceof Error ? error.message : 'Unknown'
		});
		return internalError('Failed to process file');
	}
};
