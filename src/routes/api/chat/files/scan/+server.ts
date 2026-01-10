/**
 * Scan Upload API
 *
 * POST: Accept scanned document images (receipts, invoices, letters, etc.),
 * extract information using Grok vision, and store with artisan cut.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError, validationError } from '$lib/api/errors';
import {
	generateThumbnail,
	uploadImageToStorage,
	uploadThumbnailToStorage,
	uploadSvgToStorage,
	optimizeImage
} from '$lib/capabilities/image-extraction';
import { SCAN_ARTISAN_CUT_PROMPT } from '$lib/prompts/scan-artisan-cut';
import { OPENROUTER_API_KEY } from '$env/static/private';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB (will be optimized down)

// Grok 4.1 Fast via OpenRouter for vision extraction
const SCAN_MODEL = 'x-ai/grok-4.1-fast';

/**
 * Extract information from scan using Grok vision
 */
async function extractFromScan(
	base64Image: string,
	mediaType: string
): Promise<{ title: string; artisanCut: string }> {
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${OPENROUTER_API_KEY}`,
			'HTTP-Referer': 'https://aether.vercel.app',
			'X-Title': 'Aether'
		},
		body: JSON.stringify({
			model: SCAN_MODEL,
			messages: [
				{
					role: 'system',
					content: SCAN_ARTISAN_CUT_PROMPT
				},
				{
					role: 'user',
					content: [
						{
							type: 'image_url',
							image_url: {
								url: `data:${mediaType};base64,${base64Image}`
							}
						},
						{
							type: 'text',
							text: 'Extract all information from this scanned document.'
						}
					]
				}
			],
			max_tokens: 4096,
			temperature: 0.3 // Low temperature for accurate extraction
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Vision API error: ${response.status} - ${errorText}`);
	}

	const data = await response.json();
	const content = data.choices?.[0]?.message?.content || '';

	// Parse JSON response
	try {
		// Handle potential markdown code fencing
		let jsonStr = content;
		if (jsonStr.startsWith('```json')) {
			jsonStr = jsonStr.slice(7);
		} else if (jsonStr.startsWith('```')) {
			jsonStr = jsonStr.slice(3);
		}
		if (jsonStr.endsWith('```')) {
			jsonStr = jsonStr.slice(0, -3);
		}
		jsonStr = jsonStr.trim();

		const parsed = JSON.parse(jsonStr);
		return {
			title: parsed.title || 'Untitled Scan',
			artisanCut: JSON.stringify(parsed, null, 2)
		};
	} catch {
		// If JSON parsing fails, use the raw content
		console.warn('Failed to parse scan extraction as JSON, using raw content');
		return {
			title: 'Untitled Scan',
			artisanCut: content
		};
	}
}

/**
 * POST /api/chat/files/scan
 *
 * Accepts FormData with 'image' file.
 * Extracts information using Grok vision, stores image and creates content entry.
 */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// Parse FormData
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return validationError('Invalid form data');
	}

	const imageFile = formData.get('image') as File | null;
	if (!imageFile) {
		return validationError('No image file provided');
	}

	// Validate file type
	if (!ALLOWED_TYPES.includes(imageFile.type)) {
		return validationError('Unsupported image type. Use JPEG, PNG, GIF, WebP, or SVG.');
	}

	// Validate file size
	if (imageFile.size > MAX_SIZE) {
		return validationError('Image too large. Maximum size is 50MB.');
	}

	try {
		// Read file buffer
		const arrayBuffer = await imageFile.arrayBuffer();
		const rawBuffer = Buffer.from(arrayBuffer);

		// SVGs are already tiny - skip optimization
		const isSvg = imageFile.type === 'image/svg+xml';

		// Optimize raster images (resize to 1568px max, compress to JPEG/PNG)
		let imageBuffer: Buffer;
		let ext: string;
		let mediaType: string;

		if (isSvg) {
			imageBuffer = rawBuffer;
			ext = 'svg';
			mediaType = 'image/svg+xml';
		} else {
			const optimized = await optimizeImage(rawBuffer);
			imageBuffer = optimized.buffer;
			ext = optimized.isPng ? 'png' : 'jpg';
			mediaType = optimized.isPng ? 'image/png' : 'image/jpeg';
		}

		// Convert to base64 for vision API
		const base64Image = imageBuffer.toString('base64');

		// Extract information using Grok vision
		const { title, artisanCut } = await extractFromScan(base64Image, mediaType);

		// Deselect all existing content before selecting new one
		await supabase
			.from('articles')
			.update({ is_enabled: false })
			.eq('user_id', userId)
			.eq('is_enabled', true);

		// Create content entry with scan tier
		const { data: contentData, error: contentError } = await supabase
			.from('articles')
			.insert({
				user_id: userId,
				title: title,
				raw_content: `[Scanned document: ${title}]`,
				artisan_cut: artisanCut,
				tier: 'scan',
				is_enabled: true
			})
			.select('id')
			.single();

		if (contentError || !contentData) {
			console.error('Content insert error:', contentError);
			return databaseError('Failed to create content entry');
		}

		const contentId = contentData.id;
		const bucket = 'content';

		// Upload image to storage
		const imagePath = `scans/${userId}/${contentId}/scan.${ext}`;
		if (isSvg) {
			await uploadSvgToStorage(imageBuffer, bucket, imagePath);
		} else {
			await uploadImageToStorage(imageBuffer, bucket, imagePath);
		}

		// Generate and upload thumbnail
		let thumbnailPath = `thumbnails/${userId}/${contentId}/scan.jpg`;
		try {
			const thumbnailBuffer = await generateThumbnail(imageBuffer);
			await uploadThumbnailToStorage(thumbnailBuffer, bucket, thumbnailPath);
		} catch (thumbErr) {
			console.warn('Thumbnail generation failed, using original:', thumbErr);
			thumbnailPath = imagePath;
		}

		// Create chart record (so scan appears in carousel)
		const { error: chartError } = await supabase.from('article_charts').insert({
			content_id: contentId,
			user_id: userId,
			chart_index: 1,
			storage_path: imagePath,
			thumbnail_path: thumbnailPath,
			alt_text: title
		});

		if (chartError) {
			console.error('Chart insert error:', chartError);
			// Clean up - delete the content entry
			await supabase.from('articles').delete().eq('id', contentId);
			return databaseError('Failed to create chart entry');
		}

		// Create superjournal entry (no content marker - scan image lives in canvas, not message turn)
		const { data: sjData, error: sjError } = await supabase
			.from('superjournal')
			.insert({
				user_id: userId,
				persona_name: 'felix', // Scans belong to Felix
				user_message: `Boss uploaded scan: ${title}`,
				ai_response: `Scan uploaded: **${title}**. View in canvas →`,
				content_id: contentId
			})
			.select('id')
			.single();

		if (sjError) {
			console.error('Superjournal insert error:', sjError);
			// Don't fail - content is already created, just log the error
		}

		return json({
			success: true,
			id: contentId,
			file_id: contentId,
			title: title,
			content: `Scan uploaded: **${title}**. View in canvas →`,
			superjournal_id: sjData?.id
		});
	} catch (error) {
		console.error('Scan processing error:', error);
		return databaseError(error instanceof Error ? error.message : 'Failed to process scan');
	}
};
