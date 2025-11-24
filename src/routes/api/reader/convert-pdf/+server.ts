import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { uploadFileWithRetry } from '$lib/api/anthropic-client';

// Use ANON_KEY for auth checks, SERVICE_ROLE_KEY for storage operations (storage policies require it)
const supabaseAuth = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
const supabaseStorage = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Converts HTML to PDF using Puppeteer with dynamic dimensions
 * Includes try-finally to guarantee browser cleanup
 */
async function convertHtmlToPdf(html: string): Promise<Buffer> {
	const browser = await puppeteer.launch({
		headless: 'new',
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});

	try {
		const page = await browser.newPage();

		// Set content and wait for images/resources to load
		await page.setContent(html, {
			waitUntil: 'networkidle0',
			timeout: 30000
		});

		// Get the page dimensions to determine optimal PDF size
		const dimensions = await page.evaluate(() => ({
			width: document.documentElement.scrollWidth,
			height: document.documentElement.scrollHeight
		}));

		console.log(`[PDF Convert] Page dimensions: ${dimensions.width}x${dimensions.height}px`);

		// Generate PDF with dynamic width to preserve all content
		const pdfBuffer = await page.pdf({
			width: `${Math.max(dimensions.width + 40, 800)}px`,
			height: `${dimensions.height + 40}px`,
			printBackground: true,
			margin: {
				top: '20px',
				right: '20px',
				bottom: '20px',
				left: '20px'
			}
		});

		const fileSizeMB = (pdfBuffer.length / (1024 * 1024)).toFixed(2);
		console.log(`[PDF Convert] PDF generated: ${fileSizeMB} MB`);

		if (parseFloat(fileSizeMB) > 32) {
			console.warn('[PDF Convert] ⚠️  Warning: File exceeds 32MB Anthropic Files API limit');
		}

		return pdfBuffer;
	} finally {
		await browser.close(); // Always cleanup, even on error
	}
}

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
 * Converts a single image to PDF by wrapping it in minimal HTML
 */
async function convertImageToPdf(imageSrc: string, imageAlt: string): Promise<Buffer> {
	// Sanitize alt text to prevent HTML injection
	const safeAlt = imageAlt.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

	// Create minimal HTML wrapper for the image
	const imageHtml = `
		<!DOCTYPE html>
		<html>
		<head>
			<style>
				body {
					margin: 0;
					padding: 20px;
					display: flex;
					justify-content: center;
					align-items: center;
					min-height: 100vh;
				}
				img {
					max-width: 100%;
					height: auto;
				}
			</style>
		</head>
		<body>
			<img src="${imageSrc}" alt="${safeAlt}" />
		</body>
		</html>
	`;

	return convertHtmlToPdf(imageHtml);
}

/**
 * Uploads PDF buffer to Supabase Storage
 */
async function uploadPdfToStorage(
	pdfBuffer: Buffer,
	userId: string,
	articleId: string,
	filename: string
): Promise<string> {
	const storagePath = `article-pdfs/${userId}/${articleId}/${filename}`;

	const { error: uploadError } = await supabaseStorage.storage
		.from('articles')
		.upload(storagePath, pdfBuffer, {
			contentType: 'application/pdf',
			upsert: true // Overwrite if exists
		});

	if (uploadError) {
		throw new Error(`Storage upload failed: ${uploadError.message}`);
	}

	return storagePath;
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	// 1. AUTHENTICATION CHECK
	const { user } = await safeGetSession();
	if (!user) {
		return json(
			{
				error: {
					message: 'Unauthorized - must be logged in',
					code: 'UNAUTHORIZED'
				}
			},
			{ status: 401 }
		);
	}
	const userId = user.id;

	// 2. PARSE REQUEST BODY
	let body;
	try {
		body = await request.json();
	} catch (error) {
		return json(
			{
				error: {
					message: 'Invalid JSON body',
					code: 'INVALID_JSON'
				}
			},
			{ status: 400 }
		);
	}

	const { article_id, html } = body;

	if (!article_id || !html || typeof html !== 'string') {
		return json(
			{
				error: {
					message: 'Missing article_id or html',
					code: 'INVALID_INPUT'
				}
			},
			{ status: 400 }
		);
	}

	// 3. VALIDATE HTML SIZE
	const MAX_HTML_SIZE = 5 * 1024 * 1024; // 5MB
	if (html.length > MAX_HTML_SIZE) {
		return json(
			{
				error: {
					message: `HTML content too large (max ${MAX_HTML_SIZE / 1024 / 1024}MB)`,
					code: 'INPUT_TOO_LARGE'
				}
			},
			{ status: 413 }
		);
	}

	console.log('[PDF Convert] User ID:', userId);
	console.log('[PDF Convert] Article ID:', article_id);
	console.log('[PDF Convert] HTML length:', html.length);

	try {
		// 4. VERIFY ARTICLE OWNERSHIP
		const { data: article, error: fetchError } = await supabaseAuth
			.from('articles')
			.select('id, user_id, title')
			.eq('id', article_id)
			.single();

		if (fetchError || !article) {
			return json(
				{
					error: {
						message: 'Article not found or access denied',
						code: 'NOT_FOUND'
					}
				},
				{ status: 404 }
			);
		}

		// 5. CONVERT FULL ARTICLE HTML TO PDF
		console.log('[PDF Convert] Converting full article to PDF...');
		const articlePdfBuffer = await convertHtmlToPdf(html);
		console.log(
			'[PDF Convert] Article PDF size:',
			(articlePdfBuffer.length / 1024).toFixed(2),
			'KB'
		);

		// 6. UPLOAD ARTICLE PDF TO STORAGE
		console.log('[PDF Convert] Uploading article PDF to storage...');
		const articlePdfPath = await uploadPdfToStorage(
			articlePdfBuffer,
			userId,
			article_id,
			'article.pdf'
		);
		console.log('[PDF Convert] Article PDF uploaded:', articlePdfPath);

		// 7. UPLOAD ARTICLE PDF TO ANTHROPIC FILES API
		console.log('[PDF Convert] Uploading article PDF to Anthropic Files API...');
		const anthropicUploadResult = await uploadFileWithRetry(articlePdfBuffer, 'article.pdf');

		let anthropicFileId: string | null = null;
		let anthropicFileCreatedAt: Date | null = null;

		if (anthropicUploadResult) {
			anthropicFileId = anthropicUploadResult.file_id;
			anthropicFileCreatedAt = anthropicUploadResult.created_at;
			console.log('[PDF Convert] Article PDF uploaded to Anthropic:', anthropicFileId);
		} else {
			console.warn('[PDF Convert] Failed to upload article PDF to Anthropic after retries');
			// Continue anyway - graceful degradation
		}

		// 8. UPDATE ARTICLE RECORD WITH PDF PATH AND ANTHROPIC FILE ID
		const { error: updateError } = await supabaseAuth
			.from('articles')
			.update({
				pdf_storage_path: articlePdfPath,
				anthropic_file_id: anthropicFileId,
				anthropic_file_created_at: anthropicFileCreatedAt?.toISOString()
			})
			.eq('id', article_id);

		if (updateError) {
			console.error('[PDF Convert] Failed to update article:', updateError);
			// Continue anyway - PDF is uploaded, just not linked in DB yet
		}

		// 9. EXTRACT ALL <img> TAGS
		console.log('[PDF Convert] Extracting images from HTML...');
		const images = extractImages(html);
		console.log(`[PDF Convert] Found ${images.length} images`);

		// 10. CONVERT EACH IMAGE TO SEPARATE PDF AND UPLOAD
		const chartResults: Array<{
			index: number;
			storage_path: string;
			pdf_size: number;
			alt: string;
			anthropic_file_id: string | null;
			anthropic_file_created_at: Date | null;
		}> = [];

		for (const image of images) {
			console.log(`[PDF Convert] Converting image ${image.index} to PDF...`);
			try {
				const chartPdfBuffer = await convertImageToPdf(image.src, image.alt);
				console.log(
					`[PDF Convert] Chart ${image.index} PDF size:`,
					(chartPdfBuffer.length / 1024).toFixed(2),
					'KB'
				);

				// Upload chart PDF to storage
				const chartPdfPath = await uploadPdfToStorage(
					chartPdfBuffer,
					userId,
					article_id,
					`chart-${image.index}.pdf`
				);
				console.log(`[PDF Convert] Chart ${image.index} uploaded to storage:`, chartPdfPath);

				// Upload chart PDF to Anthropic Files API
				console.log(`[PDF Convert] Uploading chart ${image.index} to Anthropic Files API...`);
				const chartAnthropicResult = await uploadFileWithRetry(
					chartPdfBuffer,
					`chart-${image.index}.pdf`
				);

				let chartAnthropicFileId: string | null = null;
				let chartAnthropicFileCreatedAt: Date | null = null;

				if (chartAnthropicResult) {
					chartAnthropicFileId = chartAnthropicResult.file_id;
					chartAnthropicFileCreatedAt = chartAnthropicResult.created_at;
					console.log(
						`[PDF Convert] Chart ${image.index} uploaded to Anthropic:`,
						chartAnthropicFileId
					);
				} else {
					console.warn(
						`[PDF Convert] Failed to upload chart ${image.index} to Anthropic after retries`
					);
					// Continue anyway - graceful degradation
				}

				chartResults.push({
					index: image.index,
					storage_path: chartPdfPath,
					pdf_size: chartPdfBuffer.length,
					alt: image.alt,
					anthropic_file_id: chartAnthropicFileId,
					anthropic_file_created_at: chartAnthropicFileCreatedAt
				});
			} catch (error) {
				console.error(`[PDF Convert] Failed to convert/upload image ${image.index}:`, error);
				// Continue with other images even if one fails
			}
		}

		// 11. INSERT CHART RECORDS INTO DATABASE
		if (chartResults.length > 0) {
			const chartRecords = chartResults.map((chart) => ({
				article_id: article_id,
				user_id: userId,
				chart_index: chart.index,
				storage_path: chart.storage_path,
				anthropic_file_id: chart.anthropic_file_id,
				anthropic_file_created_at: chart.anthropic_file_created_at?.toISOString()
				// is_relevant will be set in Phase 2 (AI filtering)
			}));

			const { error: insertError } = await supabaseAuth
				.from('article_charts')
				.insert(chartRecords);

			if (insertError) {
				console.error('[PDF Convert] Failed to insert chart records:', insertError);
				// Continue anyway - files are uploaded, just not tracked in DB yet
			}
		}

		// 12. RETURN SUCCESS WITH STORAGE PATHS AND ANTHROPIC FILE IDS
		return json({
			success: true,
			article_id: article_id,
			article_pdf_path: articlePdfPath,
			article_pdf_size: articlePdfBuffer.length,
			article_anthropic_file_id: anthropicFileId,
			charts: chartResults.map((chart) => ({
				index: chart.index,
				storage_path: chart.storage_path,
				pdf_size: chart.pdf_size,
				alt: chart.alt,
				anthropic_file_id: chart.anthropic_file_id
			})),
			total_charts: chartResults.length
		});
	} catch (error) {
		console.error('[PDF Convert] Error:', error);
		return json(
			{
				error: {
					message: 'PDF conversion failed',
					code: 'CONVERSION_ERROR',
					details: error instanceof Error ? error.message : 'Unknown error'
				}
			},
			{ status: 500 }
		);
	}
};
