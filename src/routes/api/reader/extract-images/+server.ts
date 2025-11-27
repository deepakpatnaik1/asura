import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import { uploadFileWithRetry } from '$lib/api/anthropic-client';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { extractImagesSchema, validateSchema } from '$lib/schemas';
import { notFoundError, internalError } from '$lib/api/errors';

// SERVICE_ROLE_KEY for storage operations (storage policies require it)
const supabaseStorage = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Extracts all <img> tags from HTML and returns their URLs/data
 */
function extractImages(html: string): Array<{ index: number; src: string; alt: string }> {
	const $ = cheerio.load(html);
	const images: Array<{ index: number; src: string; alt: string }> = [];

	$('img').each((index, element) => {
		const src = $(element).attr('src');
		const alt = $(element).attr('alt') || '';

		if (src) {
			images.push({
				index: index + 1, // 1-indexed for database
				src,
				alt
			});
		}
	});

	return images;
}

/**
 * Downloads an image from URL or decodes data URL
 */
async function downloadImage(imageSrc: string): Promise<Buffer> {
	// Handle data URLs (e.g., data:image/png;base64,...)
	if (imageSrc.startsWith('data:')) {
		const base64Data = imageSrc.split(',')[1];
		if (!base64Data) {
			throw new Error('Invalid data URL');
		}
		return Buffer.from(base64Data, 'base64');
	}

	// Handle HTTP/HTTPS URLs
	if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
		const response = await fetch(imageSrc);
		if (!response.ok) {
			throw new Error(`Failed to fetch image: ${response.statusText}`);
		}
		const arrayBuffer = await response.arrayBuffer();
		return Buffer.from(arrayBuffer);
	}

	throw new Error(`Unsupported image source: ${imageSrc}`);
}

/**
 * Generates a 150x150px thumbnail from an image buffer
 */
async function generateThumbnail(imageBuffer: Buffer): Promise<Buffer> {
	return await sharp(imageBuffer)
		.resize(150, 150, {
			fit: 'contain',
			background: { r: 20, g: 20, b: 20, alpha: 1 } // Dark background to match app theme
		})
		.jpeg({ quality: 80 })
		.toBuffer();
}

/**
 * Detects file extension from image buffer
 */
function getImageExtension(buffer: Buffer): string {
	// Check magic numbers
	if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
		return 'jpg';
	}
	if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
		return 'png';
	}
	if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
		return 'gif';
	}
	if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
		return 'webp';
	}
	// Default to jpg if unknown
	return 'jpg';
}

/**
 * Uploads image buffer to Supabase Storage
 */
async function uploadImageToStorage(
	imageBuffer: Buffer,
	userId: string,
	articleId: string,
	filename: string
): Promise<string> {
	const storagePath = `article-images/${userId}/${articleId}/${filename}`;

	// Detect MIME type from buffer
	let contentType = 'image/jpeg'; // default
	if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
		contentType = 'image/png';
	} else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) {
		contentType = 'image/gif';
	} else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) {
		contentType = 'image/webp';
	}

	const { error: uploadError } = await supabaseStorage.storage
		.from('articles')
		.upload(storagePath, imageBuffer, {
			contentType,
			upsert: true
		});

	if (uploadError) {
		throw new Error(`Image upload failed: ${uploadError.message}`);
	}

	return storagePath;
}

/**
 * Uploads thumbnail to Supabase Storage
 */
async function uploadThumbnailToStorage(
	thumbnailBuffer: Buffer,
	userId: string,
	articleId: string,
	chartIndex: number
): Promise<string> {
	const storagePath = `article-thumbnails/${userId}/${articleId}/chart-${chartIndex}.jpg`;

	const { error: uploadError } = await supabaseStorage.storage
		.from('articles')
		.upload(storagePath, thumbnailBuffer, {
			contentType: 'image/jpeg',
			upsert: true
		});

	if (uploadError) {
		throw new Error(`Thumbnail upload failed: ${uploadError.message}`);
	}

	return storagePath;
}

/**
 * Extract Images Endpoint
 *
 * Extracts images from HTML, generates thumbnails, uploads to storage and Anthropic.
 * NO PDF CONVERSION - Claude processes raw HTML directly.
 */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. PARSE AND VALIDATE REQUEST BODY
	const parseResult = await parseRequestJson<unknown>(request);
	if (!parseResult.success) return parseResult.error;

	const validation = validateSchema(extractImagesSchema, parseResult.data);
	if (!validation.success) return validation.error;

	const { article_id, html } = validation.data;

	try {
		// 3. VERIFY ARTICLE OWNERSHIP (explicit user_id filter for defense-in-depth)
		const { data: article, error: fetchError } = await supabase
			.from('articles')
			.select('id, user_id, title')
			.eq('id', article_id)
			.eq('user_id', userId)
			.single();

		if (fetchError || !article) {
			return notFoundError('Article');
		}

		// 4. EXTRACT ALL <img> TAGS
		const images = extractImages(html);

		// 5. PROCESS EACH IMAGE: DOWNLOAD, GENERATE THUMBNAIL, UPLOAD
		const chartResults: Array<{
			index: number;
			storage_path: string;
			thumbnail_path: string;
			image_size: number;
			alt: string;
			anthropic_file_id: string | null;
			anthropic_file_created_at: Date | null;
		}> = [];

		for (const image of images) {
			try {
				// Download image from URL or data URL
				const imageBuffer = await downloadImage(image.src);
				const imageExt = getImageExtension(imageBuffer);

				// Generate thumbnail
				const thumbnailBuffer = await generateThumbnail(imageBuffer);

				// Upload original image to storage
				const imagePath = await uploadImageToStorage(
					imageBuffer,
					userId,
					article_id,
					`chart-${image.index}.${imageExt}`
				);

				// Upload thumbnail to storage
				const thumbnailPath = await uploadThumbnailToStorage(
					thumbnailBuffer,
					userId,
					article_id,
					image.index
				);

				// Upload image to Anthropic Files API (for potential chart-specific Q&A)
				const chartAnthropicResult = await uploadFileWithRetry(
					imageBuffer,
					`chart-${image.index}.${imageExt}`
				);

				let chartAnthropicFileId: string | null = null;
				let chartAnthropicFileCreatedAt: Date | null = null;

				if (chartAnthropicResult) {
					chartAnthropicFileId = chartAnthropicResult.file_id;
					chartAnthropicFileCreatedAt = chartAnthropicResult.created_at;
				} else {
					// Continue anyway - graceful degradation
				}

				chartResults.push({
					index: image.index,
					storage_path: imagePath,
					thumbnail_path: thumbnailPath,
					image_size: imageBuffer.length,
					alt: image.alt,
					anthropic_file_id: chartAnthropicFileId,
					anthropic_file_created_at: chartAnthropicFileCreatedAt
				});
			} catch (error) {
				// Continue with other images even if one fails
			}
		}

		// 6. INSERT CHART RECORDS INTO DATABASE
		if (chartResults.length > 0) {
			const chartRecords = chartResults.map((chart) => ({
				article_id: article_id,
				user_id: userId,
				chart_index: chart.index,
				storage_path: chart.storage_path,
				thumbnail_path: chart.thumbnail_path,
				alt_text: chart.alt,
				anthropic_file_id: chart.anthropic_file_id,
				anthropic_file_created_at: chart.anthropic_file_created_at?.toISOString()
				// is_relevant will be set in filter-charts (AI filtering)
			}));

			const { error: insertError } = await supabase
				.from('article_charts')
				.insert(chartRecords);

			if (insertError) {
				// Continue anyway - files are uploaded, just not tracked in DB yet
			}
		}

		// 7. RETURN SUCCESS
		return json({
			success: true,
			article_id: article_id,
			charts: chartResults.map((chart) => ({
				index: chart.index,
				storage_path: chart.storage_path,
				thumbnail_path: chart.thumbnail_path,
				image_size: chart.image_size,
				alt: chart.alt,
				anthropic_file_id: chart.anthropic_file_id
			})),
			total_charts: chartResults.length
		});
	} catch (error) {
		return internalError('Image extraction failed');
	}
};
