/**
 * Image Extraction & Processing
 *
 * Shared utilities for extracting images from HTML, downloading, and generating thumbnails.
 * Used by both reader (article images) and chat (file images) flows.
 *
 * Note: Cheerio is dynamically imported to avoid ESM bundling issues
 * on Vercel serverless functions (parse5 ESM compatibility).
 */

// Dynamic import to isolate ESM module from cold start bundling
async function getCheerio() {
	const cheerio = await import('cheerio');
	return cheerio;
}
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// Service role client for storage operations
const supabaseStorage = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export interface ExtractedImage {
	index: number;
	src: string;
	alt: string;
}

/**
 * Extract all <img> tags from HTML
 */
export async function extractImages(html: string): Promise<ExtractedImage[]> {
	const cheerio = await getCheerio();
	const $ = cheerio.load(html);
	const images: ExtractedImage[] = [];

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

export interface ExtractedHtmlTable {
	index: number;
	headers: string[];
	rows: string[][];
}

/**
 * Extract all <table> tags from HTML and parse into structured data
 */
export async function extractHtmlTables(html: string, startIndex: number): Promise<ExtractedHtmlTable[]> {
	const cheerio = await getCheerio();
	const $ = cheerio.load(html);
	const tables: ExtractedHtmlTable[] = [];

	$('table').each((i, tableEl) => {
		const headers: string[] = [];
		const rows: string[][] = [];
		let headerRowIndex = -1;

		// Extract headers from thead > tr > th, or first row with th
		const theadRow = $(tableEl).find('thead tr').first();
		if (theadRow.length) {
			theadRow.find('th, td').each((_, el) => {
				headers.push($(el).text().trim());
			});
		} else {
			const firstRow = $(tableEl).find('tr').first();
			if (firstRow.find('th').length > 0) {
				firstRow.find('th, td').each((_, el) => {
					headers.push($(el).text().trim());
				});
				headerRowIndex = 0;
			}
		}

		// If no headers found, use first row as headers
		if (headers.length === 0) {
			const firstRow = $(tableEl).find('tr').first();
			firstRow.find('th, td').each((_, el) => {
				headers.push($(el).text().trim());
			});
			headerRowIndex = 0;
		}

		if (headers.length === 0) return;

		// Extract body rows, skipping header row if needed
		const allRows = $(tableEl).find('tbody tr');
		if (allRows.length) {
			allRows.each((rowIdx, row) => {
				if (headerRowIndex === rowIdx) return;
				const cells: string[] = [];
				$(row)
					.find('td, th')
					.each((_, cell) => {
						cells.push($(cell).text().trim());
					});
				if (cells.length > 0) {
					rows.push(cells);
				}
			});
		} else {
			$(tableEl)
				.find('tr')
				.slice(1)
				.each((_, row) => {
					const cells: string[] = [];
					$(row)
						.find('td, th')
						.each((_, cell) => {
							cells.push($(cell).text().trim());
						});
					if (cells.length > 0) {
						rows.push(cells);
					}
				});
		}

		if (rows.length === 0) return;

		tables.push({
			index: startIndex + i + 1,
			headers,
			rows
		});
	});

	return tables;
}

/**
 * Extract plain text from HTML, preserving newlines for table detection
 */
export async function htmlToPlainText(html: string): Promise<string> {
	const cheerio = await getCheerio();
	const $ = cheerio.load(html);
	$('div, p, br, tr, li').each((_, el) => {
		$(el).after('\n');
	});
	return $.text();
}

/**
 * Download image from URL or decode data URL
 */
export async function downloadImage(imageSrc: string): Promise<Buffer> {
	// Handle data URLs
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
 * Generate 150x150px thumbnail from image buffer
 */
export async function generateThumbnail(imageBuffer: Buffer): Promise<Buffer> {
	return await sharp(imageBuffer)
		.resize({ height: 150 })
		.jpeg({ quality: 80 })
		.toBuffer();
}

/**
 * Detect file extension from image buffer magic numbers
 */
export function getImageExtension(buffer: Buffer): string {
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
	return 'jpg';
}

/**
 * Get MIME type from buffer
 */
export function getMimeType(buffer: Buffer): string {
	if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
	if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif';
	if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp';
	return 'image/jpeg';
}

export interface UploadResult {
	storagePath: string;
}

/**
 * Upload image to Supabase storage
 */
export async function uploadImageToStorage(
	imageBuffer: Buffer,
	bucket: string,
	storagePath: string
): Promise<UploadResult> {
	const contentType = getMimeType(imageBuffer);

	const { error } = await supabaseStorage.storage.from(bucket).upload(storagePath, imageBuffer, {
		contentType,
		upsert: true
	});

	if (error) {
		throw new Error(`Image upload failed: ${error.message}`);
	}

	return { storagePath };
}

/**
 * Upload thumbnail to Supabase storage
 */
export async function uploadThumbnailToStorage(
	thumbnailBuffer: Buffer,
	bucket: string,
	storagePath: string
): Promise<UploadResult> {
	const { error } = await supabaseStorage.storage.from(bucket).upload(storagePath, thumbnailBuffer, {
		contentType: 'image/jpeg',
		upsert: true
	});

	if (error) {
		throw new Error(`Thumbnail upload failed: ${error.message}`);
	}

	return { storagePath };
}

/**
 * Upload SVG to Supabase storage
 */
export async function uploadSvgToStorage(
	svgBuffer: Buffer,
	bucket: string,
	storagePath: string
): Promise<UploadResult> {
	const { error } = await supabaseStorage.storage.from(bucket).upload(storagePath, svgBuffer, {
		contentType: 'image/svg+xml',
		upsert: true
	});

	if (error) {
		throw new Error(`SVG upload failed: ${error.message}`);
	}

	return { storagePath };
}
