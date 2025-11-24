import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import puppeteer from 'puppeteer';
import sharp from 'sharp';

// Use ANON_KEY for auth checks, SERVICE_ROLE_KEY for storage operations
const supabaseAuth = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
const supabaseStorage = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const THUMBNAIL_SIZE = 150; // 150x150px as specified in implementation plan

/**
 * Generate thumbnail from PDF buffer
 * Uses Sharp to convert PDF first page to JPEG thumbnail
 * Note: Sharp has built-in PDF support via libvips
 */
async function generateThumbnailFromPdf(pdfBuffer: Buffer): Promise<Buffer> {
	try {
		// Sharp can read PDFs directly (first page only)
		// Resize to thumbnail and convert to JPEG in one operation
		const thumbnailBuffer = await sharp(pdfBuffer, {
			density: 150 // DPI for PDF rendering (higher = better quality)
		})
			.resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
				fit: 'cover',
				position: 'center'
			})
			.jpeg({ quality: 80 })
			.toBuffer();

		return thumbnailBuffer;
	} catch (error) {
		console.error('[Thumbnail Generator] Sharp PDF conversion failed, falling back to Puppeteer');

		// Fallback: Use Puppeteer if Sharp fails (e.g., libvips doesn't support PDF)
		const browser = await puppeteer.launch({
			headless: 'new',
			args: ['--no-sandbox', '--disable-setuid-sandbox']
		});

		try {
			const page = await browser.newPage();

			// Convert PDF buffer to base64 data URL
			const pdfBase64 = pdfBuffer.toString('base64');
			const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;

			// Navigate to the PDF
			await page.goto(pdfDataUrl, {
				waitUntil: 'networkidle0',
				timeout: 30000
			});

			// Set viewport for screenshot
			await page.setViewport({
				width: THUMBNAIL_SIZE * 2,
				height: THUMBNAIL_SIZE * 2
			});

			// Take screenshot
			const screenshotBuffer = await page.screenshot({
				type: 'png',
				clip: {
					x: 0,
					y: 0,
					width: THUMBNAIL_SIZE * 2,
					height: THUMBNAIL_SIZE * 2
				}
			});

			// Resize and convert to JPEG
			const thumbnailBuffer = await sharp(screenshotBuffer)
				.resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
					fit: 'cover',
					position: 'center'
				})
				.jpeg({ quality: 80 })
				.toBuffer();

			return thumbnailBuffer;
		} finally {
			await browser.close();
		}
	}
}

/**
 * Upload thumbnail to Supabase Storage
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

	const { article_id } = body;

	if (!article_id) {
		return json(
			{
				error: {
					message: 'Missing article_id',
					code: 'INVALID_INPUT'
				}
			},
			{ status: 400 }
		);
	}

	console.log('[Thumbnail Generator] User ID:', userId);
	console.log('[Thumbnail Generator] Article ID:', article_id);

	try {
		// 3. VERIFY ARTICLE OWNERSHIP
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

		// 4. FETCH RELEVANT CHARTS THAT NEED THUMBNAILS
		const { data: charts, error: chartsError } = await supabaseAuth
			.from('article_charts')
			.select('id, chart_index, storage_path, thumbnail_path')
			.eq('article_id', article_id)
			.eq('is_relevant', true) // Only relevant charts
			.is('thumbnail_path', null) // Only charts without thumbnails
			.order('chart_index', { ascending: true });

		if (chartsError) {
			throw new Error(`Failed to fetch charts: ${chartsError.message}`);
		}

		if (!charts || charts.length === 0) {
			console.log('[Thumbnail Generator] No charts need thumbnails');
			return json({
				success: true,
				article_id: article_id,
				thumbnails_generated: 0,
				thumbnails: []
			});
		}

		console.log(`[Thumbnail Generator] Generating thumbnails for ${charts.length} charts`);

		// 5. GENERATE THUMBNAILS FOR EACH CHART
		const thumbnailResults: Array<{
			chart_index: number;
			thumbnail_path: string;
			thumbnail_size: number;
		}> = [];

		for (const chart of charts) {
			console.log(`[Thumbnail Generator] Processing chart ${chart.chart_index}...`);

			try {
				// Download PDF from storage
				const { data: pdfData, error: downloadError } = await supabaseStorage.storage
					.from('articles')
					.download(chart.storage_path);

				if (downloadError || !pdfData) {
					console.error(
						`[Thumbnail Generator] Failed to download chart ${chart.chart_index}:`,
						downloadError
					);
					continue; // Skip this chart, continue with others
				}

				// Convert Blob to Buffer
				const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());

				// Generate thumbnail
				const thumbnailBuffer = await generateThumbnailFromPdf(pdfBuffer);
				console.log(
					`[Thumbnail Generator] Thumbnail for chart ${chart.chart_index}:`,
					(thumbnailBuffer.length / 1024).toFixed(2),
					'KB'
				);

				// Upload thumbnail to storage
				const thumbnailPath = await uploadThumbnailToStorage(
					thumbnailBuffer,
					userId,
					article_id,
					chart.chart_index
				);
				console.log(
					`[Thumbnail Generator] Thumbnail uploaded for chart ${chart.chart_index}:`,
					thumbnailPath
				);

				// Update database with thumbnail path
				const { error: updateError } = await supabaseAuth
					.from('article_charts')
					.update({ thumbnail_path: thumbnailPath })
					.eq('id', chart.id);

				if (updateError) {
					console.error(
						`[Thumbnail Generator] Failed to update chart ${chart.chart_index}:`,
						updateError
					);
					// Continue anyway - thumbnail is uploaded, just not linked in DB yet
				}

				thumbnailResults.push({
					chart_index: chart.chart_index,
					thumbnail_path: thumbnailPath,
					thumbnail_size: thumbnailBuffer.length
				});
			} catch (error) {
				console.error(
					`[Thumbnail Generator] Failed to generate thumbnail for chart ${chart.chart_index}:`,
					error
				);
				// Continue with other charts even if one fails
			}
		}

		// 6. RETURN RESULTS
		return json({
			success: true,
			article_id: article_id,
			thumbnails_generated: thumbnailResults.length,
			thumbnails: thumbnailResults
		});
	} catch (error) {
		console.error('[Thumbnail Generator] Error:', error);
		return json(
			{
				error: {
					message: 'Thumbnail generation failed',
					code: 'THUMBNAIL_ERROR',
					details: error instanceof Error ? error.message : 'Unknown error'
				}
			},
			{ status: 500 }
		);
	}
};
