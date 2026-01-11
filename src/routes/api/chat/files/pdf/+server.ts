/**
 * PDF Upload API
 *
 * POST: Accept PDF files, extract text using pdf-parse, and create content entry.
 * Supports tier selection (ephemeral, strategic, canon).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError, validationError, internalError } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';
import {
	generateThumbnail,
	uploadImageToStorage,
	uploadThumbnailToStorage
} from '$lib/capabilities/image-extraction';
import { createMessage } from '$lib/api/anthropic-client';
import { getModelProvider, assertProviderSupported } from '$lib/calls/chat/provider';
import { DEFAULT_MODEL } from '$lib/config/models';
import { FILE_ARTISAN_CUT_PROMPT } from '$lib/prompts/file-artisan-cut';
import { FIREWORKS_API_KEY } from '$env/static/private';
import { PDFParse } from 'pdf-parse';

const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const MIN_TEXT_LENGTH = 50; // Minimum chars to consider PDF as text-based

/**
 * Call Fireworks API for file artisan cut (non-streaming).
 */
async function callFireworksArtisanCut(
	model: string,
	systemPrompt: string,
	content: string
): Promise<string> {
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
			max_tokens: 2048,
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

/**
 * Extract title from PDF text (first line or first sentence)
 */
function extractTitleFromPdfText(text: string): string {
	// Try first non-empty line
	const lines = text.split('\n').filter((line) => line.trim().length > 0);
	if (lines.length > 0) {
		const firstLine = lines[0].trim();
		// If first line is reasonably short, use it as title
		if (firstLine.length <= 100) {
			return firstLine;
		}
		// Otherwise truncate with ellipsis
		return firstLine.slice(0, 97) + '...';
	}
	return 'Untitled PDF';
}

/**
 * POST /api/chat/files/pdf
 *
 * Accepts FormData with 'pdf' file and optional 'tier'.
 * Extracts text from PDF and creates content entry.
 */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const log = createLogger('PdfAPI', userId);

	// Parse FormData
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return validationError('Invalid form data');
	}

	const pdfFile = formData.get('pdf') as File | null;
	if (!pdfFile) {
		return validationError('No PDF file provided');
	}

	// Validate file type
	if (pdfFile.type !== 'application/pdf') {
		return validationError('File must be a PDF');
	}

	// Validate file size
	if (pdfFile.size > MAX_SIZE) {
		return validationError('PDF too large. Maximum size is 50MB.');
	}

	// Get tier and owner from form data
	const tierParam = formData.get('tier') as string | null;
	const tier = tierParam === 'canon' ? 'canon' : tierParam === 'strategic' ? 'strategic' : 'ephemeral';
	const persistent = tier === 'strategic' || tier === 'canon';
	const owner = (formData.get('owner') as string) || 'system';

	log.info('Processing PDF upload', {
		filename: pdfFile.name,
		size: pdfFile.size,
		tier
	});

	try {
		// Read PDF buffer
		const arrayBuffer = await pdfFile.arrayBuffer();
		const pdfBuffer = Buffer.from(arrayBuffer);

		// Extract text from PDF using pdf-parse v2 class API
		let extractedText = '';
		let pageCount = 0;
		let pdfInfo: { Title?: string } | undefined;

		const parser = new PDFParse({ data: pdfBuffer });
		try {
			// Get info first for metadata
			const infoResult = await parser.getInfo();
			pageCount = infoResult.total || 0;
			pdfInfo = infoResult.info;

			// Get text content
			const textResult = await parser.getText();
			extractedText = textResult.text?.trim() || '';
		} catch (parseError) {
			await parser.destroy();
			log.error('PDF parsing failed', { error: parseError instanceof Error ? parseError.message : 'Unknown' });
			return validationError('Failed to parse PDF. The file may be corrupted or password-protected.');
		}
		await parser.destroy();

		// Check if PDF has extractable text
		if (extractedText.length < MIN_TEXT_LENGTH) {
			log.warn('PDF has minimal text content', { textLength: extractedText.length, pages: pageCount });
			return validationError(
				'This PDF appears to be a scanned document with no extractable text. ' +
					'Try using the Scan option with an image export, or use a PDF with an OCR layer.'
			);
		}

		log.info('PDF text extracted', {
			textLength: extractedText.length,
			pages: pageCount
		});

		let title: string;
		let artisanCut: string | null = null;

		if (persistent) {
			// Persistent: Call AI to generate title + artisan cut
			const { data: settings } = await supabase
				.from('user_settings')
				.select('default_model, model_compression')
				.eq('user_id', userId)
				.single();

			const model = settings?.model_compression || settings?.default_model || DEFAULT_MODEL;
			const provider = await getModelProvider(supabase, model);
			assertProviderSupported(provider);

			let responseText: string;

			if (provider === 'fireworks') {
				responseText = await callFireworksArtisanCut(model, FILE_ARTISAN_CUT_PROMPT, extractedText);
			} else {
				// Anthropic
				const response = await createMessage({
					model,
					max_tokens: 2048,
					temperature: 0.3,
					system: FILE_ARTISAN_CUT_PROMPT,
					messages: [{ role: 'user', content: extractedText }]
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
			} catch {
				log.error('Failed to parse AI response', { raw: responseText });
				throw new Error('Failed to parse AI response as JSON');
			}

			if (!parsed.title || !parsed.description) {
				throw new Error('AI response missing title or description');
			}

			title = parsed.title;
			artisanCut = parsed.description;
		} else {
			// Ephemeral: Extract title from PDF metadata or text
			title = pdfInfo?.Title || extractTitleFromPdfText(extractedText);
		}

		// Deselect all existing content before selecting new one
		await supabase
			.from('articles')
			.update({ is_enabled: false })
			.eq('user_id', userId)
			.eq('is_enabled', true);

		// Save to database
		const { data: file, error: insertError } = await supabase
			.from('articles')
			.insert({
				user_id: userId,
				title: title.slice(0, 255),
				raw_content: extractedText,
				artisan_cut: artisanCut,
				is_enabled: true,
				tier,
				owner
			})
			.select('id, title')
			.single();

		if (insertError) {
			log.error('Failed to save PDF content', { error: insertError.message });
			return databaseError('Failed to save PDF content');
		}

		// Create superjournal entry (no content marker - PDF content lives in canvas, not message turn)
		const { data: sjEntry, error: sjError } = await supabase
			.from('superjournal')
			.insert({
				user_id: userId,
				persona_name: 'system',
				user_message: `Boss uploaded PDF: ${file.title}`,
				ai_response: `PDF uploaded: **${file.title}** (${pageCount} pages). View in canvas →`,
				model_identifier: 'pdf-upload',
				content_id: file.id
			})
			.select('id')
			.single();

		if (sjError) {
			log.warn('Failed to create superjournal entry', { error: sjError.message });
		}

		// Render PDF pages as images for canvas display
		let chartCount = 0;
		try {
			const renderParser = new PDFParse({ data: pdfBuffer });
			const screenshots = await renderParser.getScreenshot({ scale: 1.5 });
			await renderParser.destroy();

			const bucket = 'content';

			for (let i = 0; i < screenshots.pages.length; i++) {
				const page = screenshots.pages[i];
				if (!page.data) continue;

				// Convert Uint8Array to Buffer for storage functions
				const pageBuffer = Buffer.from(page.data);

				const pageNum = i + 1;
				const imagePath = `pdfs/${userId}/${file.id}/page-${pageNum}.png`;
				let thumbnailPath = `thumbnails/${userId}/${file.id}/page-${pageNum}.jpg`;

				try {
					// Upload full page image
					await uploadImageToStorage(pageBuffer, bucket, imagePath);

					// Generate and upload thumbnail
					try {
						const thumbnailBuffer = await generateThumbnail(pageBuffer);
						await uploadThumbnailToStorage(thumbnailBuffer, bucket, thumbnailPath);
					} catch (thumbErr) {
						log.warn('Thumbnail generation failed for page', { page: pageNum, error: thumbErr });
						thumbnailPath = imagePath; // Fall back to full image
					}

					// Create chart record
					const { error: chartError } = await supabase.from('article_charts').insert({
						content_id: file.id,
						user_id: userId,
						chart_index: pageNum,
						storage_path: imagePath,
						thumbnail_path: thumbnailPath,
						alt_text: `${title} - Page ${pageNum}`
					});

					if (chartError) {
						log.warn('Failed to create chart for page', { page: pageNum, error: chartError.message });
					} else {
						chartCount++;
					}
				} catch (pageErr) {
					log.warn('Failed to process page', { page: pageNum, error: pageErr });
				}
			}

			log.info('PDF pages rendered', { chartCount, totalPages: pageCount });
		} catch (renderError) {
			// Non-fatal: text is already saved, just log the rendering failure
			log.warn('PDF page rendering failed', {
				error: renderError instanceof Error ? renderError.message : 'Unknown'
			});
		}

		log.info('PDF uploaded successfully', {
			fileId: file.id,
			title: file.title,
			pages: pageCount,
			charts: chartCount,
			textLength: extractedText.length
		});

		return json({
			success: true,
			file_id: file.id,
			id: file.id,
			title: file.title,
			content: `PDF uploaded: **${file.title}** (${pageCount} pages). View in canvas →`,
			superjournal_id: sjEntry?.id,
			pages: pageCount,
			chart_count: chartCount
		});
	} catch (error) {
		log.error('PDF upload failed', {
			error: error instanceof Error ? error.message : 'Unknown'
		});
		return internalError('Failed to process PDF');
	}
};
