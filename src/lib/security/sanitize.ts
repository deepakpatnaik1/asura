// Dynamic import to prevent Vercel cold start ESM errors
// isomorphic-dompurify → jsdom → parse5 (ESM-only)
// Cache the module after first load to avoid repeated dynamic imports
let cachedDOMPurify: typeof import('isomorphic-dompurify').default | null = null;

async function getDOMPurify() {
	if (cachedDOMPurify) return cachedDOMPurify;
	const module = await import('isomorphic-dompurify');
	cachedDOMPurify = module.default;
	return cachedDOMPurify;
}

/**
 * Default allowed tags for rendered markdown/HTML.
 */
export const DEFAULT_ALLOWED_TAGS = [
	'p',
	'br',
	'span',
	'div',
	'ul',
	'ol',
	'li',
	'hr',
	'strong',
	'em',
	'code',
	'pre'
];

/**
 * Default allowed attributes.
 */
export const DEFAULT_ALLOWED_ATTR = ['style'];

/**
 * Sanitize HTML content to prevent XSS attacks.
 *
 * @param html - Raw HTML string to sanitize
 * @param allowedTags - Tags to allow (defaults to DEFAULT_ALLOWED_TAGS)
 * @param allowedAttr - Attributes to allow (defaults to DEFAULT_ALLOWED_ATTR)
 * @returns Sanitized HTML string
 */
export async function sanitizeHtml(
	html: string,
	allowedTags: string[] = DEFAULT_ALLOWED_TAGS,
	allowedAttr: string[] = DEFAULT_ALLOWED_ATTR
): Promise<string> {
	const DOMPurify = await getDOMPurify();
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: allowedTags,
		ALLOWED_ATTR: allowedAttr
	}) as string;
}

/**
 * Sanitize user input text (strips all HTML tags).
 *
 * @param input - User input string
 * @returns Plain text with all HTML removed
 */
export async function sanitizeText(input: string): Promise<string> {
	const DOMPurify = await getDOMPurify();
	return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }) as string;
}
