import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import puppeteer from 'puppeteer';

/**
 * Demo endpoint for testing HTML to PDF conversion
 * Uses Puppeteer (production approach) to convert HTML content to PDF
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { htmlContent } = await request.json();

		if (!htmlContent || typeof htmlContent !== 'string') {
			return json({ error: 'Invalid HTML content' }, { status: 400 });
		}

		console.log('[PDF Demo] Starting conversion...');

		// Launch Puppeteer
		const browser = await puppeteer.launch({
			headless: 'new',
			args: ['--no-sandbox', '--disable-setuid-sandbox']
		});

		const page = await browser.newPage();

		// Set content and wait for images/resources to load
		await page.setContent(htmlContent, {
			waitUntil: 'networkidle0',
			timeout: 30000
		});

		// Get the page dimensions to determine optimal PDF size
		const dimensions = await page.evaluate(() => ({
			width: document.documentElement.scrollWidth,
			height: document.documentElement.scrollHeight
		}));

		console.log(`[PDF Demo] Page dimensions: ${dimensions.width}x${dimensions.height}px`);

		// Generate PDF with dynamic width to preserve all content
		// Use the actual content width + padding, ensuring nothing is cut off
		const pdfBuffer = await page.pdf({
			width: `${Math.max(dimensions.width + 40, 800)}px`, // At least 800px, add 40px padding
			height: `${dimensions.height + 40}px`, // Add 40px padding
			printBackground: true,
			margin: {
				top: '20px',
				right: '20px',
				bottom: '20px',
				left: '20px'
			}
		});

		await browser.close();

		const fileSizeMB = (pdfBuffer.length / (1024 * 1024)).toFixed(2);
		console.log(`[PDF Demo] PDF generated: ${fileSizeMB} MB`);

		if (parseFloat(fileSizeMB) > 32) {
			console.warn('[PDF Demo] ⚠️  Warning: File exceeds 32MB limit for Anthropic Files API');
		}

		// Return PDF as binary response
		return new Response(pdfBuffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': 'attachment; filename="test-article.pdf"',
				'Content-Length': pdfBuffer.length.toString()
			}
		});
	} catch (error) {
		console.error('[PDF Demo] Error:', error);
		return json(
			{
				error: 'PDF conversion failed',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
