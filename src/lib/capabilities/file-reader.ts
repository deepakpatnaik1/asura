/**
 * File Reader Capability
 *
 * Handles parsing and content extraction from uploaded documents.
 * Currently supports HTML content with Cheerio.
 *
 * Note: Cheerio is dynamically imported to avoid ESM bundling issues
 * on Vercel serverless functions (parse5 ESM compatibility).
 */

// Dynamic import to isolate ESM module from cold start bundling
async function getCheerio() {
	const cheerio = await import('cheerio');
	return cheerio;
}

/**
 * File reader configuration
 */
export interface FileReaderConfig {
	/** Maximum HTML size in bytes */
	maxHtmlSize: number;
	/** Maximum title length */
	maxTitleLength: number;
}

export const DEFAULT_FILE_READER_CONFIG: FileReaderConfig = {
	maxHtmlSize: 5 * 1024 * 1024, // 5MB
	maxTitleLength: 200
};

/**
 * Result of parsing HTML content
 */
export interface ParsedHtmlResult {
	/** Extracted title */
	title: string;
	/** Cleaned HTML content */
	html: string;
	/** Whether parsing succeeded */
	success: boolean;
	/** Error message if parsing failed */
	error?: string;
}

/**
 * Extract title from HTML or markdown content
 *
 * Priority: <h1> > <title> > markdown # header > date-based fallback
 *
 * @param content - Raw HTML or markdown string
 * @param config - File reader configuration
 * @returns Extracted title
 */
export async function extractTitleFromHtml(
	content: string,
	config: FileReaderConfig = DEFAULT_FILE_READER_CONFIG
): Promise<string> {
	let title = 'Untitled Article';

	try {
		// First, try markdown header (works for plain text/markdown content)
		const markdownMatch = content.match(/^#\s+(.+)$/m);
		if (markdownMatch) {
			title = markdownMatch[1].trim();
		} else {
			// Try HTML parsing with Cheerio
			const cheerio = await getCheerio();
			const $ = cheerio.load(content);

			// Try <h1> first
			const h1Text = $('h1').first().text().trim();
			if (h1Text) {
				title = h1Text;
			} else {
				// Try <title> tag
				const titleText = $('title').first().text().trim();
				if (titleText) {
					title = titleText;
				} else {
					// Fallback to timestamp-based title
					title = `Article ${new Date().toISOString().split('T')[0]}`;
				}
			}
		}

		// Truncate title if too long
		if (title.length > config.maxTitleLength) {
			title = title.substring(0, config.maxTitleLength) + '...';
		}
	} catch (error) {
		title = `Article ${new Date().toISOString().split('T')[0]}`;
	}

	return title;
}

/**
 * Validate HTML content size
 *
 * @param html - HTML string to validate
 * @param config - File reader configuration
 * @returns Validation result with error message if invalid
 */
export function validateHtmlSize(
	html: string,
	config: FileReaderConfig = DEFAULT_FILE_READER_CONFIG
): { valid: boolean; error?: string } {
	if (!html || typeof html !== 'string') {
		return { valid: false, error: 'Missing or invalid HTML content' };
	}

	if (html.length > config.maxHtmlSize) {
		return {
			valid: false,
			error: `HTML content too large (max ${config.maxHtmlSize / 1024 / 1024}MB)`
		};
	}

	return { valid: true };
}

/**
 * Parse HTML content and extract metadata
 *
 * @param html - Raw HTML string
 * @param config - File reader configuration
 * @returns Parsed result with title and cleaned HTML
 */
export async function parseHtml(
	html: string,
	config: FileReaderConfig = DEFAULT_FILE_READER_CONFIG
): Promise<ParsedHtmlResult> {
	const validation = validateHtmlSize(html, config);
	if (!validation.valid) {
		return {
			title: '',
			html: '',
			success: false,
			error: validation.error
		};
	}

	const title = await extractTitleFromHtml(html, config);

	return {
		title,
		html,
		success: true
	};
}
