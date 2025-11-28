import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { join } from 'path';
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

// Load font once at module level for table rendering
let fontData: ArrayBuffer | null = null;

function loadFont(): ArrayBuffer {
	if (fontData) return fontData;
	const fontPath = join(
		process.cwd(),
		'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'
	);
	fontData = readFileSync(fontPath).buffer;
	return fontData;
}

// Table styling colors (reader accent - green)
const TABLE_COLORS = {
	accent: 'rgb(16, 185, 129)',
	accentBg: 'rgba(16, 185, 129, 0.08)',
	background: '#141414',
	foreground: '#e5e5e5',
	border: 'rgba(255, 255, 255, 0.1)',
};

/**
 * Strips markdown formatting asterisks from text while preserving multiplication asterisks.
 * - Removes: **bold**, *italic*, ***bold italic***
 * - Preserves: 2 * 3, 5*10 (asterisks between numbers/words without wrapping)
 */
function stripFormattingAsterisks(text: string): string {
	// Remove bold italic (***text***)
	let result = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
	// Remove bold (**text**)
	result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
	// Remove italic (*text*) - but not multiplication like "2 * 3" or "5*10"
	// Italic asterisks wrap text: *word* or *multiple words*
	// Multiplication has spaces or digits adjacent: 2 * 3, 5*10
	result = result.replace(/\*([^*\s][^*]*[^*\s])\*/g, '$1');
	result = result.replace(/\*([^*\s])\*/g, '$1'); // Single char italic like *x*
	return result;
}

/**
 * Extracts markdown pipe tables from text content
 * Matches: | Header | Header |
 *          |--------|--------|
 *          | Cell   | Cell   |
 */
function extractMarkdownTables(
	text: string,
	startIndex: number
): Array<{ index: number; headers: string[]; rows: string[][] }> {
	const tables: Array<{ index: number; headers: string[]; rows: string[][] }> = [];

	// Regex to match markdown tables (header row, separator row, data rows)
	const tableRegex = /^(\|[^\n]+\|)\s*\n(\|[-:\s|]+\|)\s*\n((?:\|[^\n]+\|\s*\n?)+)/gm;

	let match;
	let tableIndex = 0;

	while ((match = tableRegex.exec(text)) !== null) {
		const headerLine = match[1];
		const dataLines = match[3].trim().split('\n');

		// Parse header row
		const headers = headerLine
			.split('|')
			.slice(1, -1) // Remove empty first/last from split
			.map((cell) => cell.trim());

		if (headers.length === 0) continue;

		// Parse data rows
		const rows: string[][] = [];
		for (const line of dataLines) {
			const cells = line
				.split('|')
				.slice(1, -1)
				.map((cell) => cell.trim());
			if (cells.length > 0) {
				rows.push(cells);
			}
		}

		if (rows.length === 0) continue;

		tables.push({
			index: startIndex + tableIndex + 1,
			headers,
			rows,
		});
		tableIndex++;
	}

	return tables;
}

/**
 * Extracts all <table> tags from HTML and parses them into structured data
 */
function extractHtmlTables(
	html: string,
	startIndex: number
): Array<{ index: number; headers: string[]; rows: string[][] }> {
	const $ = cheerio.load(html);
	const tables: Array<{ index: number; headers: string[]; rows: string[][] }> = [];

	$('table').each((i, tableEl) => {
		const headers: string[] = [];
		const rows: string[][] = [];

		// Extract headers from thead > tr > th, or first row with th
		const headerRow = $(tableEl).find('thead tr').first();
		if (headerRow.length) {
			headerRow.find('th, td').each((_, el) => {
				headers.push($(el).text().trim());
			});
		} else {
			// Try first row if it has th elements
			const firstRow = $(tableEl).find('tr').first();
			if (firstRow.find('th').length > 0) {
				firstRow.find('th, td').each((_, el) => {
					headers.push($(el).text().trim());
				});
			}
		}

		// If no headers found, use first row as headers
		if (headers.length === 0) {
			const firstRow = $(tableEl).find('tr').first();
			firstRow.find('th, td').each((_, el) => {
				headers.push($(el).text().trim());
			});
		}

		if (headers.length === 0) return; // Skip tables with no content

		// Extract body rows
		const bodyRows = $(tableEl).find('tbody tr');
		if (bodyRows.length) {
			bodyRows.each((_, row) => {
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
			// No tbody, skip header row and get remaining rows
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

		if (rows.length === 0) return; // Skip tables with no data rows

		tables.push({
			index: startIndex + i + 1,
			headers,
			rows,
		});
	});

	return tables;
}

/**
 * Builds JSX-like structure for satori to render a table
 */
function buildTableJsx(
	headers: string[],
	rows: string[][]
): Record<string, unknown> {
	const colWidths = calculateColumnWidths(headers, rows);

	const totalWidth = colWidths.reduce((sum, w) => sum + w, 0) + 2;

	// Build header cells (strip markdown formatting asterisks)
	const headerCells = headers.map((header, idx) => ({
		type: 'div',
		props: {
			style: {
				width: colWidths[idx],
				padding: '8px 12px',
				fontWeight: 600,
				color: TABLE_COLORS.accent,
				backgroundColor: TABLE_COLORS.accentBg,
				borderRight: idx < headers.length - 1 ? `1px solid ${TABLE_COLORS.accent}` : 'none',
				borderBottom: `1px solid ${TABLE_COLORS.accent}`,
				display: 'flex',
				alignItems: 'center',
			},
			children: stripFormattingAsterisks(header),
		},
	}));

	// Build data rows (strip markdown formatting asterisks)
	const dataRows = rows.map((row, rowIdx) => ({
		type: 'div',
		props: {
			style: {
				display: 'flex',
				backgroundColor: rowIdx % 2 === 1 ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
			},
			children: row.map((cell, cellIdx) => ({
				type: 'div',
				props: {
					style: {
						width: colWidths[cellIdx] || 100,
						padding: '8px 12px',
						color: TABLE_COLORS.foreground,
						borderRight: cellIdx < headers.length - 1 ? `1px solid ${TABLE_COLORS.border}` : 'none',
						borderBottom: rowIdx < rows.length - 1 ? `1px solid ${TABLE_COLORS.border}` : 'none',
						display: 'flex',
						alignItems: 'center',
					},
					children: stripFormattingAsterisks(cell),
				},
			})),
		},
	}));

	return {
		type: 'div',
		props: {
			style: {
				display: 'flex',
				flexDirection: 'column',
				backgroundColor: TABLE_COLORS.background,
				border: `1px solid ${TABLE_COLORS.accent}`,
				fontFamily: 'Liberation Sans',
				fontSize: 14,
				width: totalWidth,
			},
			children: [
				{
					type: 'div',
					props: {
						style: { display: 'flex' },
						children: headerCells,
					},
				},
				...dataRows,
			],
		},
	};
}

/**
 * Calculate column widths for a table (shared logic)
 */
function calculateColumnWidths(headers: string[], rows: string[][]): number[] {
	const allRows = [headers, ...rows];
	return headers.map((_, colIdx) => {
		const maxLen = Math.max(...allRows.map((row) => (row[colIdx] || '').length));
		// ~8px per character + 24px padding
		// Only cap at 400px for very long content (>50 chars)
		const naturalWidth = maxLen * 8 + 24;
		return Math.max(60, maxLen > 50 ? Math.min(400, naturalWidth) : naturalWidth);
	});
}

/**
 * Renders a table to a PNG image buffer
 */
async function renderTableToImage(
	headers: string[],
	rows: string[][]
): Promise<Buffer> {
	const tableJsx = buildTableJsx(headers, rows);

	// Calculate dimensions
	const colWidths = calculateColumnWidths(headers, rows);
	const width = colWidths.reduce((sum, w) => sum + w, 0) + 4;
	const height = (rows.length + 1) * 36 + 4;

	const font = loadFont();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const svg = await satori(tableJsx as any, {
		width,
		height,
		fonts: [
			{
				name: 'Liberation Sans',
				data: font,
				weight: 400,
				style: 'normal',
			},
		],
	});

	const resvg = new Resvg(svg, {
		background: TABLE_COLORS.background,
		fitTo: { mode: 'width', value: width },
	});
	const pngData = resvg.render();
	return Buffer.from(pngData.asPng());
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

		// 5b. EXTRACT AND RENDER TABLES AS IMAGES (HTML + Markdown)
		console.log('[ExtractImages] Starting table extraction, HTML length:', html.length);

		// Extract plain text from HTML for markdown table detection
		// Note: $.text() strips whitespace. For content with white-space:pre,
		// we need to convert block elements to newlines first
		const $2 = cheerio.load(html);
		// Replace closing block tags with newlines to preserve structure
		$2('div, p, br, tr, li').each((_, el) => {
			$2(el).after('\n');
		});
		const plainText = $2.text();
		console.log('[ExtractImages] Plain text length:', plainText.length);
		console.log('[ExtractImages] Plain text preview:', plainText.substring(0, 500));

		const htmlTables = extractHtmlTables(html, images.length);
		const mdTables = extractMarkdownTables(plainText, images.length + htmlTables.length);
		const tables = [...htmlTables, ...mdTables];
		console.log('[ExtractImages] Found tables:', { htmlTables: htmlTables.length, mdTables: mdTables.length, total: tables.length });
		for (const table of tables) {
			console.log('[ExtractImages] Processing table', table.index, 'with', table.headers.length, 'cols,', table.rows.length, 'rows');
			try {
				// Render table to PNG image
				const tableImageBuffer = await renderTableToImage(table.headers, table.rows);

				// Generate thumbnail
				const thumbnailBuffer = await generateThumbnail(tableImageBuffer);

				// Upload table image to storage
				const imagePath = await uploadImageToStorage(
					tableImageBuffer,
					userId,
					article_id,
					`table-${table.index}.png`
				);

				// Upload thumbnail to storage
				const thumbnailPath = await uploadThumbnailToStorage(
					thumbnailBuffer,
					userId,
					article_id,
					table.index
				);

				// Upload to Anthropic Files API
				const tableAnthropicResult = await uploadFileWithRetry(
					tableImageBuffer,
					`table-${table.index}.png`
				);

				let tableAnthropicFileId: string | null = null;
				let tableAnthropicFileCreatedAt: Date | null = null;

				if (tableAnthropicResult) {
					tableAnthropicFileId = tableAnthropicResult.file_id;
					tableAnthropicFileCreatedAt = tableAnthropicResult.created_at;
				}

				chartResults.push({
					index: table.index,
					storage_path: imagePath,
					thumbnail_path: thumbnailPath,
					image_size: tableImageBuffer.length,
					alt: `Table with ${table.headers.length} columns and ${table.rows.length} rows`,
					anthropic_file_id: tableAnthropicFileId,
					anthropic_file_created_at: tableAnthropicFileCreatedAt
				});
			} catch (error) {
				console.error('[ExtractImages] Failed to render table', table.index, ':', error);
				// Continue with other tables even if one fails
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
